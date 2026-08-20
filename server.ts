import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import {
  userRepo,
  profileRepo,
  templateRepo,
  conversationRepo,
  groupRepo,
  groupSessionRepo,
  memoryRepo,
  ADMIN_EMAIL_ALLOWLIST,
} from './server/repositories';
import { sendGroupInviteEmail, isSmtpConfigured } from './server/email';
import { SunnyUser, ProfileTemplate, ProfileField, UserProfileValue, ConversationMode, GroupConversationSession } from './src/types';
import { RoomManager } from './server/realtime/RoomManager';

const PORT = 3000;

// Initialize Google GenAI with API key
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());

  // Helper to determine accurate public base URL (converts private ais-dev to shared ais-pre so all links work externally)
  const getPublicBaseUrl = (req: express.Request) => {
    let candidate = (req.body && req.body.appUrl) || (req.query && req.query.appUrl) || (req.headers.origin as string) || (req.headers.referer as string) || '';
    if (candidate && typeof candidate === 'string' && candidate.startsWith('http')) {
      try {
        const u = new URL(candidate);
        let host = u.host;
        if (host.includes('ais-dev-')) {
          host = host.replace('ais-dev-', 'ais-pre-');
        }
        return `${u.protocol}//${host}`;
      } catch {}
    }

    if (process.env.APP_URL && process.env.APP_URL.startsWith('http')) {
      let u = process.env.APP_URL.replace(/\/$/, '');
      if (u.includes('ais-dev-')) {
        u = u.replace('ais-dev-', 'ais-pre-');
      }
      return u;
    }

    let host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
    if (host.includes('ais-dev-')) {
      host = host.replace('ais-dev-', 'ais-pre-');
    }
    const proto = (req.headers['x-forwarded-proto'] as string) || (req.protocol === 'http' && req.headers['x-forwarded-host'] ? 'https' : req.protocol) || 'https';
    return `${proto}://${host}`;
  };

  // Direct Invitation & Group Call Web Routes
  app.get(['/invite/:token', '/join/:token'], (req, res) => {
    res.redirect(`/?invite=${encodeURIComponent(req.params.token)}`);
  });

  app.get(['/groups/:groupId/call/:sessionId', '/group/:groupId/call/:sessionId'], (req, res) => {
    res.redirect(`/?groupId=${encodeURIComponent(req.params.groupId)}&callSession=${encodeURIComponent(req.params.sessionId)}`);
  });

  // --- REST API ENDPOINTS ---

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      app: 'Sunny - Marathwada Companion (सन्नी - मराठवाडा मित्र)',
      model: 'gemini-3.1-flash-live-preview',
      adminAllowlist: ADMIN_EMAIL_ALLOWLIST,
    });
  });

  // --- Auth & Users ---

  app.get('/api/auth/google/config', (req, res) => {
    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const hasSecret = Boolean((process.env.GOOGLE_CLIENT_SECRET || '').trim());
    const baseUrl = getPublicBaseUrl(req);
    const devCallbackUrl = `${baseUrl}/auth/callback`;
    const sharedCallbackUrl = 'https://ais-pre-qdpb2el4fke3xc6he2fbsw-971083840159.asia-southeast1.run.app/auth/callback';

    res.json({
      configured: Boolean(clientId),
      hasSecret,
      clientId: clientId || null,
      devCallbackUrl,
      sharedCallbackUrl,
    });
  });

  app.get('/api/auth/google/url', (req, res) => {
    const clientId = ((req.query.clientId as string) || process.env.GOOGLE_CLIENT_ID || '').trim();
    const baseUrl = getPublicBaseUrl(req);
    const redirectUri = ((req.query.redirectUri as string) || `${baseUrl}/auth/callback`).trim();

    if (!clientId) {
      return res.json({
        configured: false,
        url: null,
        redirectUri,
        message: 'Google Client ID is not configured.',
      });
    }

    const stateObj = { redirectUri, ts: Date.now() };
    const stateStr = Buffer.from(JSON.stringify(stateObj)).toString('base64url');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      state: stateStr,
      prompt: 'select_account',
    });

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({
      configured: true,
      url: googleAuthUrl,
      redirectUri,
    });
  });

  // OAuth Callback Route
  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code, error, state } = req.query;

    if (error) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>Google Sign-In</title></head>
          <body style="font-family:system-ui,-apple-system,sans-serif;background:#09090b;color:#fafafa;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="text-align:center;padding:2rem;background:#18181b;border:1px solid #27272a;border-radius:1rem;max-width:400px;">
              <h3 style="color:#ef4444;margin-top:0;">Authentication Cancelled</h3>
              <p style="color:#a1a1aa;font-size:13px;line-height:1.5;">${error}</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: '${error}' }, '*');
                  setTimeout(() => window.close(), 1500);
                }
              </script>
            </div>
          </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send('No authorization code provided.');
    }

    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
    
    // Resolve exact matching redirect URI from state parameter
    let redirectUri = `${getPublicBaseUrl(req)}/auth/callback`;
    if (state && typeof state === 'string') {
      try {
        const parsedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
        if (parsedState?.redirectUri) {
          redirectUri = parsedState.redirectUri;
        }
      } catch (e) {
        console.warn('Could not parse OAuth state:', e);
      }
    }

    try {
      if (!clientId || !clientSecret) {
        throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in environment variables.');
      }

      // Exchange authorization code with Google OAuth2 token endpoint
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code as string,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        const detail = tokenData.error_description || tokenData.error || 'Failed to exchange authorization code';
        console.error('Google token exchange failed:', tokenData);
        throw new Error(`${detail} (Redirect URI used: ${redirectUri})`);
      }

      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      
      if (!userRes.ok) {
        throw new Error('Failed to retrieve user profile from Google');
      }

      const userInfo = await userRes.json();
      const email = (userInfo.email || 'user@example.com').toLowerCase().trim();
      const displayName = userInfo.name || email.split('@')[0];
      const photoURL = userInfo.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayName)}`;

      const user = await userRepo.createOrUpdate({
        id: userInfo.sub ? `u_${userInfo.sub}` : undefined,
        email,
        displayName,
        photoURL,
        providerSubject: userInfo.sub,
      });

      await groupRepo.autoAcceptPendingInvitationsForEmail(email, user);

      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; background: #09090b; color: #fafafa; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
              .card { text-align: center; padding: 2rem; background: #18181b; border: 1px solid #27272a; border-radius: 1.25rem; max-width: 380px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
              .avatar { width: 56px; height: 56px; border-radius: 50%; border: 2px solid #f59e0b; margin-bottom: 12px; }
              h3 { margin: 0 0 8px 0; color: #fbbf24; font-size: 18px; }
              p { color: #a1a1aa; font-size: 13px; margin: 0; }
            </style>
          </head>
          <body>
            <div class="card">
              <img class="avatar" src="${user.photoURL}" alt="${user.displayName}" />
              <h3>Welcome, ${user.displayName}!</h3>
              <p>Authentication complete. Returning to Sunny...</p>
            </div>
            <script>
              try {
                // Set in localStorage for same-origin sharing
                localStorage.setItem('sunny_active_user_email', '${user.email}');
                localStorage.setItem('sunny_active_user', JSON.stringify(${JSON.stringify(user)}));

                // BroadcastChannel for cross-window / tab notification
                if (typeof BroadcastChannel !== 'undefined') {
                  const bc = new BroadcastChannel('sunny_auth_channel');
                  bc.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', user: ${JSON.stringify(user)} });
                  bc.close();
                }

                if (window.opener) {
                  window.opener.postMessage({
                    type: 'GOOGLE_AUTH_SUCCESS',
                    user: ${JSON.stringify(user)}
                  }, '*');
                  setTimeout(() => { window.close(); }, 400);
                } else {
                  setTimeout(() => { window.location.href = '/'; }, 600);
                }
              } catch (e) {
                window.location.href = '/';
              }
            </script>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error('Google OAuth error:', err);
      res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Error</title></head>
          <body style="font-family:system-ui,-apple-system,sans-serif;background:#09090b;color:#fafafa;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="text-align:center;padding:2rem;background:#18181b;border:1px solid #27272a;border-radius:1rem;max-width:440px;">
              <h3 style="color:#ef4444;margin-top:0;">Authentication Error</h3>
              <p style="color:#e4e4e7;font-size:13px;line-height:1.5;margin-bottom:1rem;">${err.message || 'Unknown error occurred during Google sign-in'}</p>
              <div style="font-size:11px;color:#a1a1aa;background:#09090b;padding:0.75rem;border-radius:0.5rem;text-align:left;word-break:break-all;">
                <strong>Redirect URI:</strong><br/>
                ${redirectUri}
              </div>
            </div>
          </body>
        </html>
      `);
    }
  });

  app.get('/api/auth/users', async (req, res) => {
    const users = await userRepo.getAll();
    res.json(users);
  });

  // Direct Sign Up
  app.post('/api/auth/signup', async (req, res) => {
    const { email, displayName, photoURL } = req.body;
    if (!email || !displayName) {
      return res.status(400).json({ error: 'Email and Display Name are required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await userRepo.getByEmail(cleanEmail);
    if (existing) {
      await groupRepo.autoAcceptPendingInvitationsForEmail(cleanEmail, existing);
      return res.json({ user: existing, isNew: false, message: 'Account already exists. Signed you in.' });
    }

    const user = await userRepo.createOrUpdate({
      email: cleanEmail,
      displayName: displayName.trim(),
      photoURL,
    });
    await groupRepo.autoAcceptPendingInvitationsForEmail(cleanEmail, user);
    res.status(201).json({ user, isNew: true });
  });

  // Direct Sign In
  app.post('/api/auth/signin', async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await userRepo.getByEmail(cleanEmail);
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email. Please sign up first.' });
    }
    await groupRepo.autoAcceptPendingInvitationsForEmail(cleanEmail, user);
    res.json({ user });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, displayName, photoURL } = req.body;
    if (!email || !displayName) {
      return res.status(400).json({ error: 'Email and Display Name are required' });
    }
    const cleanEmail = email.toLowerCase().trim();
    const user = await userRepo.createOrUpdate({
      email: cleanEmail,
      displayName,
      photoURL,
    });
    await groupRepo.autoAcceptPendingInvitationsForEmail(cleanEmail, user);
    res.json(user);
  });

  app.get('/api/auth/current-user', async (req, res) => {
    const email = req.query.email as string;
    if (!email) {
      return res.json(null);
    }
    const user = await userRepo.getByEmail(email);
    res.json(user);
  });

  app.put('/api/auth/users/:id/role', async (req, res) => {
    const { role } = req.body;
    if (role !== 'ADMIN' && role !== 'USER') {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const updated = await userRepo.setRole(req.params.id, role);
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json(updated);
  });

  // --- Profile Templates (Admin & Progressive Profile Onboarding) ---

  app.get('/api/templates', async (req, res) => {
    const templates = await templateRepo.getAllTemplates();
    res.json(templates);
  });

  app.get('/api/templates/published', async (req, res) => {
    const template = await templateRepo.getPublishedTemplate();
    res.json(template);
  });

  app.post('/api/templates', async (req, res) => {
    const created = await templateRepo.createTemplate({
      name: req.body.name || 'Custom Onboarding Template',
      description: req.body.description || '',
      version: req.body.version || '1.0.0',
      status: 'DRAFT',
      fields: req.body.fields || [],
      createdBy: req.body.createdBy || 'admin',
    });
    res.status(201).json(created);
  });

  app.put('/api/templates/:id', async (req, res) => {
    const updated = await templateRepo.updateTemplate(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Template not found' });
    res.json(updated);
  });

  app.post('/api/templates/:id/publish', async (req, res) => {
    const published = await templateRepo.publishTemplate(req.params.id);
    if (!published) return res.status(404).json({ error: 'Template not found' });
    res.json(published);
  });

  app.post('/api/templates/:id/fields', async (req, res) => {
    const field = await templateRepo.addField(req.params.id, req.body);
    if (!field) return res.status(404).json({ error: 'Template not found' });
    res.status(201).json(field);
  });

  app.put('/api/templates/:id/fields/:fieldId', async (req, res) => {
    const updated = await templateRepo.updateField(req.params.id, req.params.fieldId, req.body);
    if (!updated) return res.status(404).json({ error: 'Field not found' });
    res.json(updated);
  });

  app.delete('/api/templates/:id/fields/:fieldId', async (req, res) => {
    const success = await templateRepo.deleteField(req.params.id, req.params.fieldId);
    res.json({ success });
  });

  app.post('/api/templates/:id/reorder', async (req, res) => {
    const { orderedFieldIds } = req.body;
    const reordered = await templateRepo.reorderFields(req.params.id, orderedFieldIds || []);
    res.json(reordered);
  });

  // --- User Profile Values (Progressive Collection) ---

  app.get('/api/profiles/:userId', async (req, res) => {
    const values = await profileRepo.getProfileValues(req.params.userId);
    res.json(values);
  });

  app.post('/api/profiles/:userId', async (req, res) => {
    const value: UserProfileValue = {
      fieldKey: req.body.fieldKey,
      value: req.body.value,
      source: req.body.source || 'MANUAL',
      confidence: req.body.confidence || 'high',
      collectedAt: req.body.collectedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceConversationId: req.body.sourceConversationId,
    };
    const saved = await profileRepo.setProfileValue(req.params.userId, value);
    res.json(saved);
  });

  // --- Groups & Memberships ---

  app.get('/api/groups', async (req, res) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        const all = await groupRepo.getAllGroups();
        return res.json(all);
      }
      const user = await userRepo.getById(userId);
      if (user?.role === 'ADMIN') {
        const all = await groupRepo.getAllGroups();
        return res.json(all);
      }
      const groups = await groupRepo.getUserGroups(userId);
      res.json(groups);
    } catch (err: any) {
      console.error('Error fetching groups:', err);
      res.status(500).json({ error: 'Failed to fetch groups' });
    }
  });

  app.get('/api/groups/:id', async (req, res) => {
    const group = await groupRepo.getById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const members = await groupRepo.getMembers(req.params.id);
    res.json({ ...group, members });
  });

  app.post('/api/groups', async (req, res) => {
    try {
      const { name, description, ownerUserId, ownerUser, inviteEmails } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Group name is required' });
      }

      let owner = ownerUserId ? await userRepo.getById(ownerUserId) : null;
      if (!owner && ownerUser?.email) {
        owner = await userRepo.getByEmail(ownerUser.email);
      }
      if (!owner && ownerUser) {
        owner = await userRepo.createOrUpdate(ownerUser);
      }
      if (!owner && ownerUserId) {
        owner = await userRepo.createOrUpdate({
          id: ownerUserId,
          email: `${ownerUserId}@marathwada.app`,
          displayName: 'Circle Admin',
          role: 'ADMIN',
        });
      }
      if (!owner) {
        const allUsers = await userRepo.getAll();
        owner = allUsers[0] || (await userRepo.createOrUpdate({
          email: 'admin@marathwada.app',
          displayName: 'Circle Admin',
          role: 'ADMIN',
        }));
      }

      // Security check: Only Admins can create groups
      if (owner.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied: Only Admins can create new groups.' });
      }

      const newGroup = await groupRepo.create(
        {
          name: name.trim(),
          description: (description || '').trim(),
          ownerUserId: owner.id,
          status: 'ACTIVE',
        },
        owner
      );

      // Handle inviteEmails passed during creation
      const emailList: string[] = [];
      if (Array.isArray(inviteEmails)) {
        emailList.push(...inviteEmails);
      } else if (typeof inviteEmails === 'string') {
        emailList.push(...inviteEmails.split(/[\s,]+/));
      }

      const publicBaseUrl = getPublicBaseUrl(req);

      for (const raw of emailList) {
        const clean = raw.trim().toLowerCase();
        if (clean && clean.includes('@') && clean !== owner.email.toLowerCase()) {
          const inv = await groupRepo.createInvitation(newGroup.id, clean, owner.id);
          const existingUser = await userRepo.getByEmail(clean);
          if (existingUser) {
            await groupRepo.addMember(newGroup.id, existingUser.id, 'MEMBER');
          }
          await sendGroupInviteEmail({
            to: clean,
            groupName: newGroup.name,
            inviterName: owner.displayName,
            inviteToken: inv.token,
            appUrl: publicBaseUrl,
          });
        }
      }

      const members = await groupRepo.getMembers(newGroup.id);
      res.status(201).json({ ...newGroup, members });
    } catch (err: any) {
      console.error('Error creating group:', err);
      res.status(500).json({ error: err?.message || 'Failed to create group' });
    }
  });

  app.delete('/api/groups/:id', async (req, res) => {
    try {
      const success = await groupRepo.delete(req.params.id);
      res.json({ success });
    } catch (err: any) {
      console.error('Error deleting group:', err);
      res.status(500).json({ error: 'Failed to delete group' });
    }
  });

  app.get('/api/groups/:id/members', async (req, res) => {
    const members = await groupRepo.getMembers(req.params.id);
    res.json(members);
  });

  app.post('/api/groups/:id/members', async (req, res) => {
    const { userId, role } = req.body;
    const member = await groupRepo.addMember(req.params.id, userId, role || 'MEMBER');
    res.status(201).json(member);
  });

  app.delete('/api/groups/:id/members/:userId', async (req, res) => {
    const success = await groupRepo.removeMember(req.params.id, req.params.userId);
    res.json({ success });
  });

  // --- SMTP & Email Status ---
  app.get('/api/smtp/status', (req, res) => {
    const configured = isSmtpConfigured();
    res.json({
      configured,
      host: process.env.SMTP_HOST || null,
      port: process.env.SMTP_PORT || '587',
      from: process.env.SMTP_FROM || process.env.SMTP_USER || null,
      user: process.env.SMTP_USER ? `${process.env.SMTP_USER.slice(0, 3)}***` : null,
      message: configured
        ? 'SMTP email service is active and ready to deliver invitations directly to inbox.'
        : 'SMTP not configured in environment variables. Real email dispatch is pending SMTP credentials. Instant shareable invitation links and auto-join on Gmail login are active.',
    });
  });

  // --- Group Invitations ---

  app.get('/api/groups/:id/invitations', async (req, res) => {
    const invitations = await groupRepo.getGroupInvitations(req.params.id);
    res.json(invitations);
  });

  app.post('/api/groups/:id/invitations', async (req, res) => {
    try {
      const { email, emails, invitedByUserId } = req.body;
      const inviterId = invitedByUserId || 'u_rushi';
      const inviter = await userRepo.getById(inviterId);
      
      // Security check: Only Admins can invite members
      if (!inviter || inviter.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied: Only Admins can invite members to groups.' });
      }

      const group = await groupRepo.getById(req.params.id);
      if (!group) return res.status(404).json({ error: 'Group not found' });

      const emailList: string[] = [];
      if (Array.isArray(emails)) {
        emailList.push(...emails);
      } else if (typeof email === 'string') {
        emailList.push(...email.split(/[\s,]+/));
      }

      const publicBaseUrl = getPublicBaseUrl(req);
      const createdInvitations = [];

      for (const raw of emailList) {
        const clean = raw.trim().toLowerCase();
        if (clean && clean.includes('@')) {
          const inv = await groupRepo.createInvitation(req.params.id, clean, inviterId);
          const existingUser = await userRepo.getByEmail(clean);
          if (existingUser) {
            await groupRepo.addMember(req.params.id, existingUser.id, 'MEMBER');
          }

          // Trigger email delivery via SMTP (if configured) or generate direct invite link
          const emailResult = await sendGroupInviteEmail({
            to: clean,
            groupName: group.name,
            inviterName: inviter.displayName,
            inviteToken: inv.token,
            appUrl: publicBaseUrl,
          });

          createdInvitations.push({
            ...inv,
            emailSent: emailResult.success,
            smtpConfigured: emailResult.smtpConfigured,
            emailError: emailResult.error,
            inviteUrl: emailResult.inviteUrl,
          });
        }
      }

      if (createdInvitations.length === 0) {
        return res.status(400).json({ error: 'Valid email ID(s) required' });
      }

      res.status(201).json(createdInvitations.length === 1 ? createdInvitations[0] : createdInvitations);
    } catch (err: any) {
      console.error('Error inviting member:', err);
      res.status(500).json({ error: err?.message || 'Failed to send invitation' });
    }
  });

  app.post('/api/groups/:groupId/invitations/:invId/resend', async (req, res) => {
    try {
      const group = await groupRepo.getById(req.params.groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const invitations = await groupRepo.getGroupInvitations(req.params.groupId);
      const inv = invitations.find((i) => i.id === req.params.invId);
      if (!inv) return res.status(404).json({ error: 'Invitation not found' });

      // Check if user has already accepted or is already an active member
      const members = await groupRepo.getMembers(req.params.groupId);
      const isAlreadyActive = members.some(
        (m) => m.status === 'ACTIVE' && m.user?.email && m.user.email.toLowerCase().trim() === inv.invitedEmail.toLowerCase().trim()
      );

      if (inv.status === 'ACCEPTED' || isAlreadyActive) {
        return res.status(400).json({
          error: `Member (${inv.invitedEmail}) is already an active member of "${group.name}". Resending invitations is not allowed.`,
        });
      }

      const inviter = (await userRepo.getById(inv.invitedByUserId)) || { displayName: 'Circle Admin' };
      const publicBaseUrl = getPublicBaseUrl(req);

      const emailResult = await sendGroupInviteEmail({
        to: inv.invitedEmail,
        groupName: group.name,
        inviterName: inviter.displayName,
        inviteToken: inv.token,
        appUrl: publicBaseUrl,
      });

      const inviteUrl = emailResult.inviteUrl;
      const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
        inv.invitedEmail
      )}&su=${encodeURIComponent(`[Invitation] Join "${group.name}" on Marathwada Katta`)}&body=${encodeURIComponent(
        `नमस्कार!\n\nमी तुम्हाला "${group.name}" Marathwada Katta ग्रुपवर आमंत्रित केले आहे.\n\nसामील होण्यासाठी खालील लिंकवर क्लिक करा:\n${inviteUrl}\n\nसन्नी (Sunny) AI Voice Companion`
      )}`;

      res.json({
        success: emailResult.success,
        smtpConfigured: emailResult.smtpConfigured,
        messageId: emailResult.messageId,
        error: emailResult.error,
        inviteUrl,
        gmailComposeUrl,
        invitedEmail: inv.invitedEmail,
      });
    } catch (err: any) {
      console.error('Error resending invite email:', err);
      res.status(500).json({ error: err?.message || 'Failed to resend invite' });
    }
  });

  app.get('/api/invitations/:token', async (req, res) => {
    const inv = await groupRepo.getInvitationByToken(req.params.token);
    if (!inv) return res.status(404).json({ error: 'Invitation not found or expired' });
    res.json(inv);
  });

  app.post('/api/invitations/:token/accept', async (req, res) => {
    try {
      const { userId, email, displayName } = req.body;
      const inv = await groupRepo.getInvitationByToken(req.params.token);
      if (!inv) return res.status(404).json({ error: 'Invitation not found or expired' });

      let targetUser = userId ? await userRepo.getById(userId) : null;
      const targetEmail = (email || inv.invitedEmail || '').toLowerCase().trim();

      if (!targetUser && targetEmail) {
        targetUser = await userRepo.getByEmail(targetEmail);
      }

      if (!targetUser && targetEmail) {
        const derivedName = displayName || targetEmail.split('@')[0].replace(/[._-]/g, ' ');
        targetUser = await userRepo.createOrUpdate({
          email: targetEmail,
          displayName: derivedName,
          role: 'USER',
        });
      }

      if (!targetUser) {
        return res.status(400).json({ error: 'Unable to identify or create user profile for this invitation' });
      }

      const result = await groupRepo.acceptInvitation(req.params.token, targetUser);
      if (!result) return res.status(400).json({ error: 'Could not accept invitation' });
      
      // Auto-accept any other pending invitations for this email across all groups
      await groupRepo.autoAcceptPendingInvitationsForEmail(targetEmail, targetUser);

      res.json({
        ...result,
        user: targetUser,
      });
    } catch (e: any) {
      console.error('Error accepting invitation:', e);
      res.status(500).json({ error: e.message || 'Failed to accept invitation' });
    }
  });

  app.post('/api/invitations/:token/reject', async (req, res) => {
    const result = await groupRepo.rejectInvitation(req.params.token);
    if (!result) return res.status(404).json({ error: 'Invitation not found' });
    res.json({ success: true, invitation: result });
  });

  app.delete('/api/groups/:groupId/invitations/:invId', async (req, res) => {
    const result = await groupRepo.revokeInvitation(req.params.invId);
    res.json({ success: result });
  });

  // --- Datastore Inspection & Verification (Admin) ---
  app.get('/api/admin/datastore-info', async (req, res) => {
    try {
      const users = await userRepo.getAll();
      const groups = await groupRepo.getAllGroups();
      const templates = await templateRepo.getAllTemplates();
      const memories = await memoryRepo.getAllMemories();
      const allInvitations = await groupRepo.getGroupInvitations('all');

      res.json({
        storageType: 'JSON-backed Firestore Schema Store (sunny_firestore_store.json)',
        location: path.join(process.cwd(), 'sunny_firestore_store.json'),
        collections: {
          users: { count: users.length, description: 'User accounts, roles (Admin/User), auth provider credentials' },
          groups: { count: groups.length, description: 'Marathwada Katta Circles and friendship groups' },
          templates: { count: templates.length, description: 'Dynamic profile templates for onboarding' },
          memories: { count: memories.length, description: 'Long-term extracted memory graph & relationship facts' },
        },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- Conversations & Highlights ---

  app.get('/api/conversations', async (req, res) => {
    const userId = (req.query.userId as string) || 'u_rushi';
    const groupId = req.query.groupId as string;
    if (groupId) {
      const groupConvs = await conversationRepo.getGroupConversations(groupId);
      return res.json(groupConvs);
    }
    const convs = await conversationRepo.getUserConversations(userId);
    res.json(convs);
  });

  app.get('/api/conversations/:id', async (req, res) => {
    const conv = await conversationRepo.getById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    const utterances = await conversationRepo.getUtterances(req.params.id);
    const highlights = await conversationRepo.getHighlights(req.params.id);
    res.json({ ...conv, utterances, highlights });
  });

  app.post('/api/conversations', async (req, res) => {
    const { mode, ownerUserId, groupId, title, groupName } = req.body;
    const newConv = await conversationRepo.create({
      mode: mode || 'SOLO',
      ownerUserId: ownerUserId || 'u_rushi',
      groupId,
      groupName,
      status: 'ACTIVE',
      title: title || (mode === 'SOLO' ? '1-on-1 with Sunny' : 'Group Katta Session'),
    });
    res.status(201).json(newConv);
  });

  app.put('/api/conversations/:id/end', async (req, res) => {
    const { summary } = req.body;
    const updated = await conversationRepo.update(req.params.id, {
      status: 'COMPLETED',
      endedAt: new Date().toISOString(),
      summary: summary || 'Completed live conversation with Sunny.',
    });
    res.json(updated);
  });

  // --- Memories API ---

  app.get('/api/memories', async (req, res) => {
    const userId = req.query.userId as string;
    const groupId = req.query.groupId as string;
    const personName = (req.query.personName as string || '').toLowerCase();

    if (userId || personName) {
      const all = await memoryRepo.getAllMemories();
      const scoped = all.filter((m) => {
        const pName = (m.personName || '').toLowerCase();
        const isUserMem = (userId && m.userId === userId) ||
          (personName && (pName === personName || pName === personName.split(' ')[0]));
        const isGroupMem = pName === 'group' || !!m.groupId || (!m.userId && (pName === 'group' || !m.personName));
        return isUserMem || isGroupMem;
      });
      return res.json(scoped);
    }

    if (groupId) {
      const groupMems = await memoryRepo.getGroupMemories(groupId);
      return res.json(groupMems);
    }

    const all = await memoryRepo.getAllMemories();
    res.json(all);
  });

  app.post('/api/memories', async (req, res) => {
    const created = await memoryRepo.addMemory({
      userId: req.body.userId,
      groupId: req.body.groupId,
      personName: req.body.personName || 'Group',
      type: req.body.type || 'FACT',
      subject: req.body.subject || 'Discussion',
      fact: req.body.fact || '',
      context: req.body.context || 'Captured from live conversation',
      confidence: req.body.confidence || 'high',
      sourceConversationId: req.body.sourceConversationId,
    });
    res.status(201).json(created);
  });

  app.put('/api/memories/:id', async (req, res) => {
    const updated = await memoryRepo.updateMemory(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Memory not found' });
    res.json(updated);
  });

  app.delete('/api/memories/:id', async (req, res) => {
    const success = await memoryRepo.deleteMemory(req.params.id);
    res.json({ success });
  });

  // Legacy compat endpoints for previous frontend components
  app.get('/api/people', async (req, res) => {
    const users = await userRepo.getAll();
    const profiles = await profileRepo.getAllUserProfiles();
    const people = users.map((u) => {
      const userProf = profiles[u.id] || {};
      const keyFacts: string[] = [];
      if (userProf.profession?.value) keyFacts.push(`Profession: ${userProf.profession.value}`);
      if (userProf.hometown?.value) keyFacts.push(`Hometown: ${userProf.hometown.value}`);
      if (userProf.currentGoals?.value) keyFacts.push(`Goal: ${userProf.currentGoals.value}`);
      if (userProf.hobbies?.value) keyFacts.push(`Hobbies: ${userProf.hobbies.value}`);

      return {
        id: u.id,
        name: u.displayName,
        profession: userProf.profession?.value || '',
        keyFacts,
        isDefaultGroupMember: true,
      };
    });
    res.json(people);
  });

  const roomManager = new RoomManager(ai);

  // --- Realtime Group Call Sessions API ---

  app.get('/api/groups/active-sessions', async (req, res) => {
    try {
      const sessions = await groupSessionRepo.getAllActive();
      res.json({ sessions });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/groups/:groupId/sessions/active', async (req, res) => {
    try {
      const session = await groupSessionRepo.getActiveByGroupId(req.params.groupId);
      res.json({ session });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/groups/:groupId/sessions/:sessionId', async (req, res) => {
    try {
      const { groupId, sessionId } = req.params;
      const userId = req.query.userId as string | undefined;

      const group = await groupRepo.getById(groupId);
      if (!group) {
        return res.status(404).json({ error: 'This call is unavailable.' });
      }

      const session = await groupSessionRepo.getById(sessionId);
      if (!session || session.groupId !== groupId) {
        return res.status(404).json({ error: 'This call is unavailable.' });
      }

      let isMember = false;
      if (userId) {
        const user = await userRepo.getById(userId);
        if (user) {
          const members = await groupRepo.getMembers(groupId);
          isMember = members.some((m) => m.userId === userId && m.status === 'ACTIVE');
          if (!isMember && (group.ownerUserId === userId || user.role === 'ADMIN')) {
            await groupRepo.addMember(groupId, userId, 'ADMIN');
            isMember = true;
          }
        }
      }

      const activeParticipants = roomManager.getRoomParticipantNames(sessionId);

      res.json({
        group: {
          id: group.id,
          name: group.name,
          description: group.description,
        },
        session: {
          id: session.id,
          groupId: session.groupId,
          groupName: session.groupName,
          status: session.status,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          startedByUserName: session.startedByUserName,
          activeParticipantsCount: session.activeParticipantsCount || activeParticipants.length,
        },
        isMember,
        activeParticipants,
      });
    } catch (e: any) {
      console.error('Error fetching group session details:', e);
      res.status(500).json({ error: 'This call is unavailable.' });
    }
  });

  app.post('/api/groups/:groupId/sessions/start', async (req, res) => {
    try {
      const { userId } = req.body;
      const groupId = req.params.groupId;

      const user = await userRepo.getById(userId);
      if (!user) return res.status(401).json({ error: 'User not found' });

      const group = await groupRepo.getById(groupId);
      if (!group) return res.status(404).json({ error: 'Group not found' });

      const members = await groupRepo.getMembers(groupId);
      let isMember = members.some((m) => m.userId === userId && m.status === 'ACTIVE');
      if (!isMember && (group.ownerUserId === userId || user.role === 'ADMIN')) {
        await groupRepo.addMember(groupId, userId, 'ADMIN');
        isMember = true;
      }
      if (!isMember) return res.status(403).json({ error: 'Must be an active member to start call' });

      // Check if session already active
      const existing = await groupSessionRepo.getActiveByGroupId(groupId);
      if (existing) {
        await roomManager.getOrCreateRoom(existing);
        return res.json({ session: existing, conversationId: existing.conversationId, isExisting: true });
      }

      // Create Conversation record
      const conv = await conversationRepo.create({
        mode: 'GROUP',
        ownerUserId: user.id,
        groupId: group.id,
        groupName: group.name,
        status: 'ACTIVE',
        title: `${group.name} - Live Call with Sunny`,
      });

      // Create Group Conversation Session
      const roomId = `room_${group.id}_${Date.now()}`;
      const session = await groupSessionRepo.create({
        groupId: group.id,
        groupName: group.name,
        roomProvider: 'WEBRTC_ROOM',
        roomId,
        conversationId: conv.id,
        startedByUserId: user.id,
        startedByUserName: user.displayName,
        status: 'LIVE',
        startedAt: new Date().toISOString(),
        activeParticipantsCount: 1,
      });

      // Initialize room on RoomManager
      await roomManager.getOrCreateRoom(session);

      res.status(201).json({ session, conversationId: conv.id });
    } catch (e: any) {
      console.error('Error starting group session:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/groups/:groupId/sessions/:sessionId/join-token', async (req, res) => {
    try {
      const { userId, deviceMode = 'INDIVIDUAL' } = req.body;
      const { groupId, sessionId } = req.params;

      const user = await userRepo.getById(userId);
      if (!user) return res.status(401).json({ error: 'User not found' });

      const members = await groupRepo.getMembers(groupId);
      const group = await groupRepo.getById(groupId);
      let isMember = members.some((m) => m.userId === userId && m.status === 'ACTIVE');
      if (!isMember && group && (group.ownerUserId === userId || user.role === 'ADMIN')) {
        await groupRepo.addMember(groupId, userId, 'ADMIN');
        isMember = true;
      }
      if (!isMember) return res.status(403).json({ error: 'Must be an active member to join call' });

      const session = await groupSessionRepo.getById(sessionId);
      if (!session || session.groupId !== groupId || (session.status !== 'LIVE' && session.status !== 'STARTING')) {
        return res.status(400).json({ error: 'Group session is not currently active' });
      }

      // Ensure room is ready on RoomManager
      await roomManager.getOrCreateRoom(session);

      const tokenPayload = {
        userId: user.id,
        groupId,
        sessionId,
        roomId: session.roomId,
        displayName: user.displayName,
        deviceMode,
        issuedAt: Date.now(),
      };
      const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');

      res.json({
        token,
        roomId: session.roomId,
        sessionId: session.id,
        groupId,
        groupName: session.groupName,
        conversationId: session.conversationId,
        wsPath: '/room-ws',
      });
    } catch (e: any) {
      console.error('Error issuing join token:', e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/groups/:groupId/sessions/:sessionId/end', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const success = await roomManager.endRoomSession(sessionId);
      res.json({ success });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- HTTP SERVER & WEBSOCKET SETUP ---

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const roomWss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host}`).pathname : '';
    if (pathname === '/live') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (pathname === '/room-ws') {
      roomWss.handleUpgrade(request, socket, head, (ws) => {
        const urlObj = new URL(request.url || '', `http://${request.headers.host}`);
        const userId = urlObj.searchParams.get('userId') || '';
        const groupId = urlObj.searchParams.get('groupId') || '';
        const sessionId = urlObj.searchParams.get('sessionId') || '';
        const roomId = urlObj.searchParams.get('roomId') || '';
        const deviceMode = (urlObj.searchParams.get('deviceMode') as any) || 'INDIVIDUAL';
        roomManager.handleClientConnection(ws, { userId, groupId, sessionId, roomId, deviceMode });
      });
    } else {
      socket.destroy();
    }
  });

  // --- Sunny Tool Definitions for Gemini Live Session ---
  const sunnyTools = [
    {
      functionDeclarations: [
        {
          name: 'save_memory',
          description:
            'Save a key fact, decision, plan, preference, update, or personal memory to long-term storage. In Group mode, set personName to "Group" unless the speaker explicitly introduced themselves.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              personName: {
                type: Type.STRING,
                description: 'Name of the person if explicitly known, or "Group"',
              },
              subject: {
                type: Type.STRING,
                description: 'Short topic or subject (e.g., Goa Trip, Startup Architecture, Work Transition)',
              },
              fact: {
                type: Type.STRING,
                description: 'The specific fact, plan, or note learned from the conversation',
              },
              context: {
                type: Type.STRING,
                description: 'Brief context of when/how it was mentioned',
              },
              memoryType: {
                type: Type.STRING,
                enum: ['PREFERENCE', 'PLAN', 'FACT', 'RELATIONSHIP', 'BACKGROUND'],
                description: 'Categorization of this memory',
              },
            },
            required: ['subject', 'fact'],
          },
        },
        {
          name: 'save_profile_field',
          description:
            'Save or update a structured profile field for the current user during progressive conversational onboarding in SOLO mode.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              fieldKey: {
                type: Type.STRING,
                description: 'The profile field key being answered (e.g., profession, hometown, currentGoals, hobbies, foodPreference)',
              },
              value: {
                type: Type.STRING,
                description: 'The extracted value or answer provided by the user',
              },
              confidence: {
                type: Type.STRING,
                enum: ['high', 'medium', 'low'],
                description: 'Confidence in the extracted profile value',
              },
            },
            required: ['fieldKey', 'value'],
          },
        },
        {
          name: 'save_highlight',
          description:
            'Capture an important discussion highlight, major decision, or key action item from the active conversation.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                enum: ['DECISION', 'ACTION_ITEM', 'INSIGHT', 'TOPIC', 'NOTE'],
                description: 'Type of highlight',
              },
              text: {
                type: Type.STRING,
                description: 'Concise summary of the highlight or decision',
              },
              importance: {
                type: Type.STRING,
                enum: ['HIGH', 'MEDIUM', 'LOW'],
                description: 'Importance level',
              },
            },
            required: ['type', 'text'],
          },
        },
      ],
    },
  ];

  // Helper to build System Instruction tailored for SOLO or GROUP Mode
  async function buildSystemInstruction(
    mode: ConversationMode,
    currentUser: SunnyUser,
    activeMembers: string[],
    groupId?: string
  ): Promise<{ systemInstruction: string; uncollectedFields: ProfileField[]; isOnboarding: boolean }> {
    const publishedTemplate = await templateRepo.getPublishedTemplate();
    const userProfile = await profileRepo.getProfileValues(currentUser.id);
    const userMemories = await memoryRepo.getUserMemories(currentUser.id);
    const groupMemories = groupId ? await memoryRepo.getGroupMemories(groupId) : [];
    const allRecentMemories = (await memoryRepo.getAllMemories()).slice(0, 15);

    if (mode === 'SOLO') {
      // Find missing or low confidence template fields for progressive collection
      const templateFields = publishedTemplate?.fields || [];
      const uncollectedFields = templateFields
        .filter((f) => f.active && (!userProfile[f.fieldKey] || !userProfile[f.fieldKey].value || userProfile[f.fieldKey].confidence === 'low'))
        .sort((a, b) => {
          const priorityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
          return priorityWeight[b.collectionPriority] - priorityWeight[a.collectionPriority];
        });

      const isOnboarding = uncollectedFields.length > 0 || userMemories.length === 0;

      const profileSummaryStr = Object.entries(userProfile)
        .filter(([_, v]) => !!v.value)
        .map(([k, v]) => `- ${k}: ${v.value} (Confidence: ${v.confidence})`)
        .join('\n') || '- None recorded yet.';

      const uncollectedStr = uncollectedFields
        .map(
          (f, idx) =>
            `${idx + 1}. Field: "${f.fieldKey}" (${f.label}) [Priority: ${f.collectionPriority}]
   Marathi Question: "${f.initialPrompt}"
   Description: ${f.description}`
        )
        .join('\n') || '- All core onboarding fields have been answered!';

      const pastMemoriesStr = userMemories
        .slice(0, 10)
        .map((m) => `- (${m.subject}): ${m.fact}`)
        .join('\n') || '- No prior memories recorded for this user.';

      const systemInstruction = `
*** SUNNY (सन्नी) - SOLO 1-ON-1 MARATHWADA VOICE COMPANION ***
You are Sunny (सन्नी), the warm, authentic, witty Marathi best friend from Marathwada having a direct 1-on-1 voice conversation with ${currentUser.displayName}.

PERSONALITY & TONE:
- Language: Authentic conversational Marathi with natural Marathwada warmth and dialect flavor (e.g. "काय राव", "भावा", "अरे वा", "एक नंबर", "काय चाललंय").
- Tone: Welcoming, observant, genuine, respectful, and highly supportive.
- Spoken Audio Style: Speak in natural, concise spoken Marathi (1-3 sentences per turn). Avoid robotic lists or lengthy monologues.

ABOUT THE USER (${currentUser.displayName}):
- User ID: ${currentUser.id}
- Email: ${currentUser.email}
- Known Profile Memory:
${profileSummaryStr}

USER-SPECIFIC PAST MEMORIES:
${pastMemoriesStr}

CURRENT ONBOARDING STATUS: ${isOnboarding ? 'ONBOARDING REQUIRED (पार्श्वभूमी ओळख आवश्यक आहे)' : 'ONBOARDING COMPLETED (पूर्ण ओळख झालेली आहे)'}
UNANSWERED ONBOARDING QUESTIONS IN PRIORITY ORDER:
${uncollectedStr}

*** CRITICAL ONBOARDING RULES (अति महत्त्वाचे नियम): ***
${
  isOnboarding
    ? `1. MANDATORY ONBOARDING GATE:
   - Because this user is new or has unanswered profile questions, you MUST complete their background onboarding first.
   - Start immediately by greeting ${currentUser.displayName} and asking the first unanswered question (e.g. profession or hometown).
   - DO NOT ENTERTAIN OTHER REQUESTS YET: If the user tries to ask general questions, seek advice, discuss other topics, or skip ahead BEFORE answering the onboarding questions, you MUST politely and playfully refuse and redirect them back to the onboarding question first!
     * Example Redirection in Marathi: "अरे ${currentUser.displayName}, आधी आपली ओळख तर होऊ दे मित्रा! मला आधी सांग तू काय करतोस / कुठला आहेस, मग आपण त्या विषयावर सविस्तर निवांत गप्पा मारू!"

2. TICK-MARK RULE (DO NOT GRILL THE USER):
   - As soon as ${currentUser.displayName} gives an answer to an onboarding question (even a short, casual answer like "मी Software engineer आहे" or "पुण्यात असतो"):
     a) IMMEDIATELY CALL BOTH \`save_profile_field\` AND \`save_memory\` tools in that exact turn!
     b) Acknowledge their answer warmly ("अरे वा! छान!", "मस्त! एक नंबर!").
     c) DO NOT GRILL, interrogate, or cross-examine the user with follow-up scrutiny on the same question. Accept it as TICKED OFF.
     d) Smoothly proceed to the next unanswered onboarding question.

3. UNLOCKING FULL CONVERSATION:
   - Once all core onboarding questions have been answered and saved via tools, celebrate: "चला, आता आपली पक्की ओळख झाली! आता सांग आज काय विषय?" and unlock full conversational mode!`
    : `1. FULL COMPANIONSHIP ACTIVE:
   - You already know ${currentUser.displayName}'s background! Greet them warmly like an old buddy: "काय ${currentUser.displayName}, काय चाललंय? आज काय विषय?"
   - Freely discuss any topics, brainstorm, give advice, or joke around.
   - When any new facts, decisions, plans, or preferences are shared, IMMEDIATELY call \`save_memory\` (and \`save_profile_field\` if relevant).`
}

TOOL USAGE DIRECTIVES:
- Whenever user mentions their profession, hometown, goals, hobbies, or food: ALWAYS call \`save_profile_field\` AND \`save_memory\`.
- All saved memories and profile attributes MUST be persisted for user ID "${currentUser.id}".
`;

      return { systemInstruction, uncollectedFields, isOnboarding };
    }

    // GROUP MODE
    const group = groupId ? await groupRepo.getById(groupId) : null;
    const groupName = group ? group.name : 'Core Marathwada Katta';

    const groupMemoriesStr = [...groupMemories, ...allRecentMemories]
      .slice(0, 15)
      .map((m) => `- [${m.personName || 'Group'}] (${m.subject}): ${m.fact}`)
      .join('\n');

    const systemInstruction = `
*** ABSOLUTE TOP-PRIORITY SYSTEM DIRECTIVE - SILENCE IN GROUP MODE ***
You are Sunny (सन्नी), a close, trusted friend sitting in the room/call with a circle of Marathi friends (${groupName}).
YOUR MANDATORY DEFAULT STATE IS 100% COMPLETE SILENCE.

RULES OF ENGAGEMENT IN GROUP MODE:
1. DO NOT SPEAK OR GENERATE ANY AUDIO OUTPUT UNLESS YOU HEAR YOUR NAME ("Sunny", "सन्नी", "Sunya", "सन्न्या") OR ARE EXPLICITLY DIRECTED TO SPEAK (e.g., "सन्नी सांग", "Sunny काय वाटतं", "सन्नी तू बोल").
2. When human friends talk among themselves without calling your name:
   - YOU MUST STAY 100% SILENT.
   - Do NOT interject, do NOT offer fillers like "हं", "हो", "okay", or "अरे".
   - Your ONLY action during silent listening is to invoke \`save_memory\` and \`save_highlight\` when people discuss plans, preferences, decisions, or updates.

*** CRITICAL: SPEAKER IDENTITY AND NAME ATTRIBUTION RULES ***
Knowing the names of people in the room (${activeMembers.join(', ')}) DOES NOT mean you know who produced the current audio utterance.

1. SPEAKER IDENTITY CONFIDENCE RULE:
   - Treat speaker identity as strictly KNOWN or UNKNOWN.
   - You MUST treat SPEAKER_IDENTITY = UNKNOWN by default for all incoming speech.
   - NEVER guess who is speaking based on voice tone, topics, or who spoke previously.

2. RESPONDING WHEN SPEAKER IDENTITY IS UNKNOWN:
   - When responding (because your name "Sunny" / "सन्नी" was called out), if speaker identity is UNKNOWN:
   - DO NOT USE ANY PARTICIPANT'S NAME TO ADDRESS THE CURRENT SPEAKER!
   - DO NOT say: "Rushi, तुझं म्हणणं..." or "Nakul,..."
   - Respond smoothly in authentic Marathi WITHOUT using a name:
     - Example: "हं, हे म्हणणं मला पटतंय. यावर माझा विचार असा आहे..."
     - Example: "याच्या उलट मागच्या वेळी एक point आला होता ना..."
   - GOLDEN RULE: Wrong name is substantially worse than no name. When uncertain, NEVER guess.

3. EXPLICIT IDENTIFICATION:
   - Only treat identity as KNOWN if the speaker explicitly introduces themselves (e.g., "मी ऋषी बोलतोय...").

4. TOOL USAGE:
   - When saving a memory or highlight during group chat, set \`personName\` to "Group" unless identity was explicitly stated.
   - Call \`save_highlight\` when group makes an important decision or agrees on an action item.

MEMBERS PRESENT IN THE GROUP ROOM:
${activeMembers.join(', ') || 'Rushi, Dutta, Nakul, Yunus, Eknath'}

RELEVANT GROUP MEMORIES:
${groupMemoriesStr}
`;

    return { systemInstruction, uncollectedFields: [], isOnboarding: false };
  }

  // Handle WebSocket Live Connections
  wss.on('connection', async (clientWs: WebSocket, request: http.IncomingMessage) => {
    console.log('Client connected to Sunny Live WS');

    const urlParams = new URL(request.url || '', `http://${request.headers.host}`).searchParams;
    const userId = urlParams.get('userId') || 'u_rushi';
    const mode = (urlParams.get('mode') as ConversationMode) || 'SOLO';
    const groupId = urlParams.get('groupId') || undefined;
    let conversationId = urlParams.get('conversationId') || '';
    const membersParam = urlParams.get('members');
    const activeMembers = membersParam ? membersParam.split(',') : ['Rushi', 'Dutta', 'Nakul', 'Yunus', 'Eknath'];

    const currentUser = (await userRepo.getById(userId)) || (await userRepo.createOrUpdate({ email: 'user@sunny.app', displayName: 'Friend' }));

    // Create or Resume Conversation record
    if (!conversationId) {
      const newConv = await conversationRepo.create({
        mode,
        ownerUserId: currentUser.id,
        groupId,
        groupName: groupId ? 'Group Session' : undefined,
        status: 'ACTIVE',
        title: mode === 'SOLO' ? `1-on-1 with Sunny (${currentUser.displayName})` : `Group Katta Session`,
      });
      conversationId = newConv.id;
    }

    clientWs.send(
      JSON.stringify({
        type: 'session_resumed',
        conversationId,
      })
    );

    const { systemInstruction, uncollectedFields, isOnboarding } = await buildSystemInstruction(
      mode,
      currentUser,
      activeMembers,
      groupId
    );

    let session: any = null;

    try {
      session = await ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Puck' }, // Male voice for Sunny
            },
          },
          systemInstruction: systemInstruction,
          tools: sunnyTools,
        },
        callbacks: {
          onmessage: async (message: any) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;

            // Handle Tool Calls
            if (message.toolCall) {
              const functionCalls = message.toolCall.functionCalls;
              if (functionCalls && functionCalls.length > 0) {
                const responses: any[] = [];
                for (const call of functionCalls) {
                  if (call.name === 'save_memory') {
                    const { personName, subject, fact, context, memoryType } = call.args || {};
                    const newMem = await memoryRepo.addMemory({
                      userId: currentUser.id,
                      groupId: groupId,
                      personName: personName || (mode === 'SOLO' ? currentUser.displayName : 'Group'),
                      type: memoryType || 'FACT',
                      subject: subject || 'Conversation Note',
                      fact: fact || '',
                      context: context || `Captured in ${mode} session with Sunny`,
                      confidence: 'high',
                      sourceConversationId: conversationId,
                    });

                    clientWs.send(
                      JSON.stringify({
                        type: 'memory_saved',
                        memory: newMem,
                      })
                    );

                    responses.push({
                      id: call.id,
                      name: call.name,
                      response: { result: 'Memory saved successfully in storage for user' },
                    });
                  } else if (call.name === 'save_profile_field') {
                    const { fieldKey, value, confidence } = call.args || {};
                    const saved = await profileRepo.setProfileValue(currentUser.id, {
                      fieldKey,
                      value,
                      source: 'CONVERSATION',
                      confidence: confidence || 'high',
                      collectedAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString(),
                      sourceConversationId: conversationId,
                    });

                    // Ensure user-specific Memory is also created and persisted for this profile field
                    const subjectLabel =
                      fieldKey === 'profession'
                        ? 'Profession & Work'
                        : fieldKey === 'hometown'
                        ? 'Hometown & Native Place'
                        : fieldKey === 'currentGoals'
                        ? 'Current Goals & Focus'
                        : fieldKey === 'hobbies'
                        ? 'Hobbies & Passions'
                        : fieldKey === 'foodPreference'
                        ? 'Food & Cuisine Preference'
                        : fieldKey;

                    const newMem = await memoryRepo.addMemory({
                      userId: currentUser.id,
                      personName: currentUser.displayName,
                      type: 'BACKGROUND',
                      subject: subjectLabel,
                      fact: `${fieldKey}: ${value}`,
                      context: 'Onboarding background with Sunny',
                      confidence: confidence || 'high',
                      sourceConversationId: conversationId,
                    });

                    clientWs.send(
                      JSON.stringify({
                        type: 'profile_field_saved',
                        profileValue: saved,
                      })
                    );

                    clientWs.send(
                      JSON.stringify({
                        type: 'memory_saved',
                        memory: newMem,
                      })
                    );

                    responses.push({
                      id: call.id,
                      name: call.name,
                      response: { result: `Profile field ${fieldKey} and user memory saved successfully` },
                    });
                  } else if (call.name === 'save_highlight') {
                    const { type, text, importance } = call.args || {};
                    const hl = await conversationRepo.addHighlight(conversationId, {
                      type: type || 'INSIGHT',
                      text: text || '',
                      importance: importance || 'HIGH',
                    });

                    clientWs.send(
                      JSON.stringify({
                        type: 'highlight_saved',
                        highlight: hl,
                      })
                    );

                    responses.push({
                      id: call.id,
                      name: call.name,
                      response: { result: 'Highlight captured successfully' },
                    });
                  }
                }

                if (session && responses.length > 0) {
                  try {
                    session.sendToolResponse({ functionResponses: responses });
                  } catch (e) {
                    console.error('Error sending tool response:', e);
                  }
                }
              }
            }

            // Audio from Sunny
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              clientWs.send(JSON.stringify({ type: 'audio', audio: audioData }));
            }

            // Text transcription from Sunny
            const textContent = message.serverContent?.modelTurn?.parts?.[0]?.text;
            if (textContent) {
              await conversationRepo.addUtterance(conversationId, {
                conversationId,
                speakerType: 'sunny',
                speakerName: 'Sunny (सन्नी)',
                text: textContent,
                sequenceNumber: 0,
                identityConfidence: 'KNOWN',
              });

              clientWs.send(
                JSON.stringify({
                  type: 'transcript',
                  sender: 'sunny',
                  text: textContent,
                  speakerName: 'Sunny (सन्नी)',
                })
              );
            }

            // Interruption signal
            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }

            // Turn complete
            if (message.serverContent?.turnComplete) {
              clientWs.send(JSON.stringify({ type: 'turnComplete' }));
            }
          },
          onerror: (err: any) => {
            console.error('Gemini Live session error:', err);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'error', message: err.message || 'Gemini Live error' }));
            }
          },
          onclose: () => {
            console.log('Gemini Live session closed');
          },
        },
      });

      console.log(`Connected to Gemini Live session for user ${currentUser.displayName} (${mode} mode)`);

      // If in Solo Mode, proactively prompt Sunny to speak first with greeting / onboarding question
      if (session && mode === 'SOLO') {
        try {
          if (isOnboarding && uncollectedFields.length > 0) {
            const nextQuestion = uncollectedFields[0];
            session.sendRealtimeInput({
              text: `[SYSTEM: User "${currentUser.displayName}" has connected. You MUST speak first immediately in warm spoken Marathi: Greet ${currentUser.displayName} and ask the first onboarding background question: "${nextQuestion.initialPrompt}". Remember the mandatory onboarding gate: do not entertain other requests until background questions are answered. When answered, tick mark them without grilling!]`,
            });
          } else {
            session.sendRealtimeInput({
              text: `[SYSTEM: User "${currentUser.displayName}" has connected. Greet them warmly in authentic Marathwada Marathi: "काय ${currentUser.displayName}, काय चाललंय? आज काय विषय?"]`,
            });
          }
        } catch (initErr) {
          console.error('Error sending initial turn greeting to Live session:', initErr);
        }
      }
    } catch (err: any) {
      console.error('Failed to connect to Gemini Live API:', err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            message: 'Failed to connect to Gemini Live AI session: ' + err.message,
          })
        );
      }
      return;
    }

    // Handle messages from Client Browser
    clientWs.on('message', async (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'audio' && msg.audio && session) {
          session.sendRealtimeInput({
            audio: {
              data: msg.audio,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } else if (msg.type === 'text' && msg.text && session) {
          // Log utterance
          await conversationRepo.addUtterance(conversationId, {
            conversationId,
            speakerType: 'user',
            speakerUserId: currentUser.id,
            speakerName: mode === 'SOLO' ? currentUser.displayName : 'Friend',
            text: msg.text,
            sequenceNumber: 0,
            identityConfidence: mode === 'SOLO' ? 'KNOWN' : 'UNKNOWN',
          });

          session.sendRealtimeInput({
            text: msg.text,
          });
        }
      } catch (e) {
        console.error('Error handling WebSocket message:', e);
      }
    });

    clientWs.on('close', async () => {
      console.log('Client WS disconnected');
      if (session) {
        try {
          session.close();
        } catch {}
      }
      // Mark conversation completed
      try {
        await conversationRepo.update(conversationId, {
          status: 'COMPLETED',
          endedAt: new Date().toISOString(),
        });
      } catch {}
    });
  });

  // Vite Development Middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const indexPath = path.resolve(process.cwd(), 'index.html');
        if (fs.existsSync(indexPath)) {
          let template = fs.readFileSync(indexPath, 'utf-8');
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } else {
          next();
        }
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Sunny App Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
