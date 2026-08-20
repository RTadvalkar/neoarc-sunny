import { Person, Memory } from '../types';

export const DEFAULT_PEOPLE: Person[] = [
  {
    id: 'p1',
    name: 'Rushi',
    nicknames: ['ऋषी', 'Rushi'],
    profession: 'Computer Engineer',
    interests: ['Software Startups', 'Product Development', 'Tech Architecture', 'Coding'],
    style: 'Innovative, ambitious, product-focused, entrepreneurial mindset',
    keyFacts: [
      'Computer engineer',
      'Currently building his software startup',
      'Passionate about SaaS, engineering products, and technical innovation'
    ],
    isDefaultGroupMember: true
  },
  {
    id: 'p2',
    name: 'Dutta',
    nicknames: ['दत्ता', 'Dutta'],
    profession: 'Electronics Engineer / Quality Analyst',
    interests: ['Quality Assurance', 'Automation', 'Accenture Work', 'Electronics'],
    style: 'Detail-oriented, practical, structured, quality-focused',
    keyFacts: [
      'Electronics engineer',
      'Currently working in Accenture as a Quality Analyst',
      'Experienced in corporate software testing and quality processes'
    ],
    isDefaultGroupMember: true
  },
  {
    id: 'p3',
    name: 'Nakul',
    nicknames: ['नकुल', 'Nakul'],
    profession: 'QA Analyst (BCS, MCS)',
    interests: ['Software Testing', 'MNC Engineering', 'Quality Metrics', 'Tech Trends'],
    style: 'Analytical, sharp, observant, systematic thinker',
    keyFacts: [
      'Completed BCS and MCS degrees',
      'Currently working in an MNC as a Quality Analyst',
      'Focused on enterprise software testing and quality engineering'
    ],
    isDefaultGroupMember: true
  },
  {
    id: 'p4',
    name: 'Yunus',
    nicknames: ['युनूस', 'Yunus'],
    profession: 'Computer Engineer',
    interests: ['Software Development', 'Persistent Systems', 'Coding', 'Technology'],
    style: 'Logic-driven, friendly, tech-savvy, collaborative problem solver',
    keyFacts: [
      'Computer engineer',
      'Currently working in Persistent Systems as a software developer',
      'Loves core programming and tech discussions'
    ],
    isDefaultGroupMember: true
  },
  {
    id: 'p5',
    name: 'Eknath',
    nicknames: ['एकनाथ', 'Eknath'],
    profession: 'Pharmacy Owner (BA History)',
    interests: ['Pharmacy Business', 'History & Culture', 'Healthcare', 'Local Business'],
    style: 'Grounded, knowledgeable, business-minded, community-connected',
    keyFacts: [
      'BA degree in History',
      'Currently owns and operates his own pharmacy business',
      'Combines practical local business management with a deep love for history'
    ],
    isDefaultGroupMember: true
  }
];

export const DEFAULT_MEMORIES: Memory[] = [
  {
    id: 'm1',
    personName: 'Rushi',
    subject: 'Software Startup',
    fact: 'Rushi is a computer engineer currently building his software startup.',
    context: 'Core group background knowledge',
    date: '2026-08-08',
    confidence: 'high',
    lastReferenced: '2026-08-08'
  },
  {
    id: 'm2',
    personName: 'Dutta',
    subject: 'Accenture QA',
    fact: 'Dutta is an electronics engineer working at Accenture as a Quality Analyst.',
    context: 'Core group background knowledge',
    date: '2026-08-08',
    confidence: 'high',
    lastReferenced: '2026-08-08'
  },
  {
    id: 'm3',
    personName: 'Nakul',
    subject: 'MNC Quality Analyst',
    fact: 'Nakul holds BCS and MCS degrees and works in an MNC as a Quality Analyst.',
    context: 'Core group background knowledge',
    date: '2026-08-08',
    confidence: 'high',
    lastReferenced: '2026-08-08'
  },
  {
    id: 'm4',
    personName: 'Yunus',
    subject: 'Persistent Systems Software',
    fact: 'Yunus is a computer engineer working at Persistent Systems.',
    context: 'Core group background knowledge',
    date: '2026-08-08',
    confidence: 'high',
    lastReferenced: '2026-08-08'
  },
  {
    id: 'm5',
    personName: 'Eknath',
    subject: 'Pharmacy & History',
    fact: 'Eknath completed a BA in History and currently runs his own pharmacy.',
    context: 'Core group background knowledge',
    date: '2026-08-08',
    confidence: 'high',
    lastReferenced: '2026-08-08'
  }
];

