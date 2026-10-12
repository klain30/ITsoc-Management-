/**
 * Seeds reference data (always) and demo data (development only).
 *
 *   npm run db:seed              → RBAC, organization profile, default positions,
 *                                  plus demo data when NODE_ENV !== 'production'
 *   SEED_DEMO=0 npm run db:seed  → reference data only
 *
 * Demo data is only inserted into an empty database.
 */
import { Prisma, PrismaClient, type ExpenseCategory, type ExpenseStatus, type RoleName } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { randomCode } from '../src/lib/tokens.js';
import { seedReferenceData } from '../src/scripts/bootstrap.js';

const prisma = new PrismaClient();

export const DEMO_PASSWORD = 'ItsocDemo2026!';

// ─── Demo data ──────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Andrea', 'Miguel', 'Bea', 'Carlo', 'Denise', 'Enzo', 'Francine', 'Gabriel', 'Hannah', 'Ivan',
  'Jasmine', 'Kyle', 'Leah', 'Marco', 'Nicole', 'Oliver', 'Patricia', 'Rafael', 'Samantha', 'Tristan',
  'Ursula', 'Vince', 'Wendy', 'Xavier', 'Ysabel', 'Zach', 'Angelica', 'Bryan', 'Czarina', 'Dominic',
];
const LAST_NAMES = [
  'Santos', 'Reyes', 'Cruz', 'Bautista', 'Ocampo', 'Garcia', 'Mendoza', 'Torres', 'Villanueva', 'Ramos',
  'Aquino', 'Castillo', 'Navarro', 'Flores', 'Dela Cruz', 'Gonzales', 'Lopez', 'Manalo', 'Pascual', 'Soriano',
];
const COURSES = ['BS Information Technology', 'BS Computer Science', 'BS Information Systems', 'BS Entertainment and Multimedia Computing'];

const day = 24 * 60 * 60 * 1000;
const hour = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(Date.now() + offsetMs);
const dateOnly = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

const seedDemoData = async () => {
  if ((await prisma.member.count()) > 0) {
    console.log('Members already exist — skipping demo data.');
    return;
  }

  const roles = Object.fromEntries((await prisma.role.findMany()).map((role) => [role.name, role.id])) as Record<RoleName, string>;
  const positions = Object.fromEntries((await prisma.position.findMany()).map((p) => [p.name, p.id]));
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  let studentSeq = 1000;
  const createMember = async (opts: {
    firstName: string;
    lastName: string;
    email: string;
    role: RoleName;
    status?: 'ACTIVE' | 'INACTIVE' | 'ALUMNI';
    invited?: boolean;
    yearLevel?: number;
    course?: string;
  }) => {
    studentSeq += 1;
    return prisma.member.create({
      data: {
        studentId: `2023-${String(studentSeq).padStart(5, '0')}`,
        firstName: opts.firstName,
        lastName: opts.lastName,
        email: opts.email,
        course: opts.course ?? COURSES[studentSeq % COURSES.length],
        yearLevel: opts.yearLevel ?? ((studentSeq % 4) + 1),
        section: `${String.fromCharCode(65 + (studentSeq % 3))}`,
        contactNumber: `+63917${String(1000000 + studentSeq).slice(-7)}`,
        status: opts.status ?? 'ACTIVE',
        dateJoined: dateOnly(at(-(200 + (studentSeq % 150)) * day)),
        user: {
          create: {
            roleId: roles[opts.role],
            status: opts.invited ? 'INVITED' : 'ACTIVE',
            passwordHash: opts.invited ? null : passwordHash,
            lastLoginAt: opts.invited ? null : at(-(studentSeq % 9) * day),
          },
        },
      },
      include: { user: true },
    });
  };

  const officers = {
    president: await createMember({ firstName: 'Maria', lastName: 'Santos', email: 'president@itsoc.test', role: 'PRESIDENT', yearLevel: 4 }),
    vp: await createMember({ firstName: 'Leo', lastName: 'Cruz', email: 'vp@itsoc.test', role: 'VICE_PRESIDENT', yearLevel: 4 }),
    secretary: await createMember({ firstName: 'Ana', lastName: 'Dela Rosa', email: 'secretary@itsoc.test', role: 'SECRETARY', yearLevel: 3 }),
    treasurer: await createMember({ firstName: 'Paolo', lastName: 'Lim', email: 'treasurer@itsoc.test', role: 'TREASURER', yearLevel: 3 }),
    auditor: await createMember({ firstName: 'Grace', lastName: 'Tan', email: 'auditor@itsoc.test', role: 'AUDITOR', yearLevel: 3 }),
  };
  const demoMember = await createMember({ firstName: 'Juan', lastName: 'Dizon', email: 'member@itsoc.test', role: 'MEMBER', yearLevel: 2 });
  const presidentUserId = officers.president.user!.id;
  const secretaryUserId = officers.secretary.user!.id;
  const treasurerUserId = officers.treasurer.user!.id;

  const termStart = dateOnly(at(-120 * day));
  const officerPositions: [typeof officers.president, string][] = [
    [officers.president, 'President'],
    [officers.vp, 'Vice President'],
    [officers.secretary, 'Secretary'],
    [officers.treasurer, 'Treasurer'],
    [officers.auditor, 'Auditor'],
  ];
  for (const [member, position] of officerPositions) {
    await prisma.positionAssignment.create({
      data: { memberId: member.id, positionId: positions[position], startDate: termStart, assignedById: presidentUserId },
    });
  }

  const regular = [demoMember];
  for (let i = 0; i < FIRST_NAMES.length; i += 1) {
    const firstName = FIRST_NAMES[i];
    const lastName = LAST_NAMES[(i * 7) % LAST_NAMES.length];
    const member = await createMember({
      firstName,
      lastName,
      email: `${firstName}.${lastName}`.toLowerCase().replace(/\s+/g, '') + `${i}@students.university.edu.ph`,
      role: 'MEMBER',
      status: i % 13 === 12 ? 'ALUMNI' : i % 11 === 10 ? 'INACTIVE' : 'ACTIVE',
      invited: i % 9 === 8,
    });
    regular.push(member);
  }
  await prisma.positionAssignment.create({
    data: { memberId: regular[3].id, positionId: positions['Public Relations Officer'], startDate: termStart, assignedById: presidentUserId },
  });
  await prisma.positionAssignment.create({
    data: { memberId: regular[5].id, positionId: positions['Committee Head'], startDate: termStart, assignedById: presidentUserId },
  });

  const activeMembers = [...Object.values(officers), ...regular].filter((m) => m.status === 'ACTIVE' && m.user?.status === 'ACTIVE');

  // ─── Events ──────────────────────────────────────────────────────────────
  const makeEvent = (data: {
    name: string;
    description: string;
    location: string;
    startsAt: Date;
    hours: number;
    capacity: number;
    status: 'DRAFT' | 'PUBLISHED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  }) =>
    prisma.event.create({
      data: {
        name: data.name,
        description: data.description,
        location: data.location,
        startsAt: data.startsAt,
        endsAt: new Date(data.startsAt.getTime() + data.hours * hour),
        registrationDeadline: new Date(data.startsAt.getTime() - day),
        capacity: data.capacity,
        status: data.status,
        createdById: secretaryUserId,
        reminderSentAt: data.status === 'COMPLETED' ? new Date(data.startsAt.getTime() - day) : null,
      },
    });

  const anniversary = await makeEvent({
    name: 'CCIS Foundation Anniversary',
    description: 'A day-long celebration of the college with booths, a programming quiz bee and an evening program.',
    location: 'University Gymnasium',
    startsAt: new Date(dateOnly(at(-21 * day)).getTime() + 1 * hour),
    hours: 8,
    capacity: 150,
    status: 'COMPLETED',
  });
  const gitWorkshop = await makeEvent({
    name: 'Intro to Git & GitHub Workshop',
    description: 'Hands-on workshop on version control, branching and pull requests. Bring a laptop.',
    location: 'Computer Laboratory 3',
    startsAt: new Date(dateOnly(at(-10 * day)).getTime() + 6 * hour),
    hours: 3,
    capacity: 40,
    status: 'COMPLETED',
  });
  const assembly = await makeEvent({
    name: 'General Assembly — 2nd Semester',
    description: 'Semester kickoff: officer reports, financial report and upcoming activities.',
    location: 'AVR, CCIS Building',
    startsAt: at(-30 * 60 * 1000),
    hours: 3,
    capacity: 200,
    status: 'ONGOING',
  });
  const techTalk = await makeEvent({
    name: 'Tech Talk: AI in Philippine Industry',
    description: 'Industry speakers discuss how local companies adopt machine learning.',
    location: 'AVR, CCIS Building',
    startsAt: new Date(dateOnly(at(3 * day)).getTime() + 5 * hour),
    hours: 2,
    capacity: 120,
    status: 'PUBLISHED',
  });
  const hackathon = await makeEvent({
    name: 'Hackathon 2026: Build for Barangays',
    description: '24-hour hackathon building tools for local government units. Teams of 3–5.',
    location: 'CCIS Innovation Hub',
    startsAt: new Date(dateOnly(at(12 * day)).getTime() + 1 * hour),
    hours: 24,
    capacity: 60,
    status: 'PUBLISHED',
  });
  await makeEvent({
    name: 'Year-end Recognition Night',
    description: 'Awarding of outstanding members and officers.',
    location: 'Function Hall',
    startsAt: new Date(dateOnly(at(60 * day)).getTime() + 10 * hour),
    hours: 4,
    capacity: 180,
    status: 'DRAFT',
  });
  await makeEvent({
    name: 'Community Coding Outreach',
    description: 'Teaching basic computer literacy at a partner high school.',
    location: 'San Isidro National High School',
    startsAt: new Date(dateOnly(at(-5 * day)).getTime() + 1 * hour),
    hours: 5,
    capacity: 25,
    status: 'CANCELLED',
  });

  const register = async (eventId: string, members: typeof activeMembers, registeredAt: Date) => {
    await prisma.eventRegistration.createMany({
      data: members.map((m) => ({ eventId, memberId: m.id, registeredAt })),
    });
  };

  // Completed events: registrations + attendance + certificates
  const anniversaryAttendees = activeMembers.slice(0, 26);
  await register(anniversary.id, anniversaryAttendees, new Date(anniversary.startsAt.getTime() - 7 * day));
  const gitAttendees = activeMembers.filter((_, i) => i % 2 === 0).slice(0, 14);
  await register(gitWorkshop.id, gitAttendees, new Date(gitWorkshop.startsAt.getTime() - 4 * day));

  const recordAttendance = async (event: typeof anniversary, members: typeof activeMembers) => {
    const session = await prisma.attendanceSession.create({
      data: {
        eventId: event.id,
        name: 'Check-in',
        secret: randomCode(32),
        opensAt: new Date(event.startsAt.getTime() - 30 * 60 * 1000),
        closesAt: event.endsAt,
        lateAfter: new Date(event.startsAt.getTime() + 15 * 60 * 1000),
        closedAt: event.endsAt,
        createdById: secretaryUserId,
      },
    });
    const certificates: Prisma.CertificateCreateManyInput[] = [];
    for (const [i, member] of members.entries()) {
      const status = i % 8 === 7 ? 'ABSENT' : i % 5 === 4 ? 'LATE' : 'PRESENT';
      await prisma.attendance.create({
        data: {
          eventId: event.id,
          memberId: member.id,
          sessionId: status === 'ABSENT' ? null : session.id,
          status,
          source: status === 'ABSENT' ? 'SYSTEM' : 'QR',
          checkedInAt: status === 'ABSENT' ? null : new Date(event.startsAt.getTime() + (status === 'LATE' ? 25 : i) * 60 * 1000),
        },
      });
      if (status !== 'ABSENT') {
        certificates.push({
          code: `ITSOC-${randomCode(4)}-${randomCode(4)}`,
          eventId: event.id,
          memberId: member.id,
          recipientName: `${member.firstName} ${member.lastName}`,
          eventName: event.name,
          eventDate: event.startsAt,
          issuedAt: new Date(event.endsAt.getTime() + 2 * day),
          issuedById: secretaryUserId,
        });
      }
    }
    return certificates;
  };
  const anniversaryCerts = await recordAttendance(anniversary, anniversaryAttendees);
  await recordAttendance(gitWorkshop, gitAttendees); // certificates not yet issued for this one
  await prisma.certificate.createMany({ data: anniversaryCerts });

  // Upcoming / ongoing registrations
  await register(assembly.id, activeMembers.slice(0, 30), at(-3 * day));
  await register(techTalk.id, activeMembers.slice(2, 20), at(-1 * day));
  await register(hackathon.id, activeMembers.slice(6, 18), at(-2 * day));

  // ─── Finance ─────────────────────────────────────────────────────────────
  const makeBudget = (name: string, amount: string, eventId: string | null, description: string) =>
    prisma.budget.create({
      data: { name, allocatedAmount: new Prisma.Decimal(amount), eventId, description, createdById: treasurerUserId },
    });

  const anniversaryBudget = await makeBudget(
    'CCIS Foundation Anniversary',
    '32000.00',
    anniversary.id,
    'Approved by the college for the foundation anniversary celebration.',
  );
  const hackathonBudget = await makeBudget('Hackathon 2026', '50000.00', hackathon.id, 'Sponsorship from partner companies plus org funds.');
  const operatingBudget = await makeBudget('General Operating Fund — AY 2025–2026', '15000.00', null, 'Day-to-day organization expenses.');

  const addExpense = async (opts: {
    budgetId: string;
    amount: string;
    category: ExpenseCategory;
    description: string;
    daysAgo: number;
    status: ExpenseStatus;
    paidByMemberId?: string;
    reviewNote?: string;
  }) => {
    const createdAt = at(-opts.daysAgo * day);
    const expense = await prisma.expense.create({
      data: {
        budgetId: opts.budgetId,
        amount: new Prisma.Decimal(opts.amount),
        category: opts.category,
        description: opts.description,
        expenseDate: dateOnly(createdAt),
        paidByMemberId: opts.paidByMemberId,
        status: opts.status,
        createdById: treasurerUserId,
        reviewedById: opts.status === 'PENDING' ? null : presidentUserId,
        reviewedAt: opts.status === 'PENDING' ? null : new Date(createdAt.getTime() + day),
        reviewNote: opts.reviewNote,
        reimbursedAt: opts.status === 'REIMBURSED' ? new Date(createdAt.getTime() + 2 * day) : null,
        createdAt,
      },
    });
    const history: Prisma.ExpenseStatusChangeCreateManyInput[] = [
      { expenseId: expense.id, fromStatus: null, toStatus: 'PENDING', changedById: treasurerUserId, createdAt },
    ];
    if (opts.status !== 'PENDING') {
      const reviewed = opts.status === 'REJECTED' ? 'REJECTED' : 'APPROVED';
      history.push({
        expenseId: expense.id,
        fromStatus: 'PENDING',
        toStatus: reviewed,
        changedById: presidentUserId,
        note: opts.reviewNote,
        createdAt: new Date(createdAt.getTime() + day),
      });
    }
    if (opts.status === 'REIMBURSED') {
      history.push({
        expenseId: expense.id,
        fromStatus: 'APPROVED',
        toStatus: 'REIMBURSED',
        changedById: treasurerUserId,
        createdAt: new Date(createdAt.getTime() + 2 * day),
      });
    }
    await prisma.expenseStatusChange.createMany({ data: history });
  };

  // The spec's worked example: ₱32,000 budget, ₱28,000 spent, ₱4,000 remaining.
  await addExpense({ budgetId: anniversaryBudget.id, amount: '12500.00', category: 'FOOD', description: 'Packed lunch and snacks for participants', daysAgo: 22, status: 'REIMBURSED', paidByMemberId: officers.treasurer.id });
  await addExpense({ budgetId: anniversaryBudget.id, amount: '8000.00', category: 'DECORATIONS', description: 'Stage backdrop and balloons', daysAgo: 23, status: 'APPROVED' });
  await addExpense({ budgetId: anniversaryBudget.id, amount: '3500.00', category: 'MATERIALS', description: 'Booth materials and art supplies', daysAgo: 24, status: 'APPROVED' });
  await addExpense({ budgetId: anniversaryBudget.id, amount: '2000.00', category: 'PRINTING', description: 'Tarpaulins and certificates', daysAgo: 24, status: 'REIMBURSED', paidByMemberId: officers.secretary.id });
  await addExpense({ budgetId: anniversaryBudget.id, amount: '2000.00', category: 'PRIZES', description: 'Quiz bee prizes', daysAgo: 21, status: 'APPROVED' });
  await addExpense({ budgetId: anniversaryBudget.id, amount: '1800.00', category: 'OTHER', description: 'Extra sound system rental', daysAgo: 21, status: 'REJECTED', reviewNote: 'Covered by the college AV office; not an org expense.' });

  await addExpense({ budgetId: hackathonBudget.id, amount: '18000.00', category: 'FOOD', description: 'Meals for 60 participants (3 meals + midnight snack)', daysAgo: 2, status: 'PENDING' });
  await addExpense({ budgetId: hackathonBudget.id, amount: '6500.00', category: 'PRIZES', description: 'Cash prizes for top 3 teams', daysAgo: 3, status: 'APPROVED' });
  await addExpense({ budgetId: hackathonBudget.id, amount: '2400.00', category: 'PRINTING', description: 'Participant IDs and banners', daysAgo: 1, status: 'PENDING' });

  await addExpense({ budgetId: operatingBudget.id, amount: '1250.00', category: 'MATERIALS', description: 'Office supplies for the org room', daysAgo: 40, status: 'REIMBURSED', paidByMemberId: officers.secretary.id });
  await addExpense({ budgetId: operatingBudget.id, amount: '899.00', category: 'OTHER', description: 'Domain renewal for itsoc website', daysAgo: 15, status: 'APPROVED' });
  await addExpense({ budgetId: operatingBudget.id, amount: '600.00', category: 'TRANSPORTATION', description: 'Transport for outreach ocular visit', daysAgo: 6, status: 'PENDING', paidByMemberId: officers.vp.id });

  // ─── Announcements & notifications ───────────────────────────────────────
  await prisma.announcement.createMany({
    data: [
      {
        title: 'Hackathon 2026 registration is open',
        content:
          'Form teams of 3–5 and register through the Events page before the deadline. Slots are limited to 60 participants. Meals will be provided.',
        status: 'PUBLISHED',
        isPinned: true,
        publishedAt: at(-2 * day),
        authorId: presidentUserId,
      },
      {
        title: 'Certificates for the Foundation Anniversary are available',
        content: 'Members who attended can now download their certificates from the Certificates page.',
        status: 'PUBLISHED',
        publishedAt: at(-18 * day),
        authorId: secretaryUserId,
      },
      {
        title: 'General Assembly today',
        content: 'Please bring your phone — attendance will be taken by scanning the QR code on screen.',
        status: 'PUBLISHED',
        publishedAt: at(-6 * hour),
        expiresAt: at(1 * day),
        authorId: secretaryUserId,
      },
      {
        title: 'Draft: Year-end Recognition Night nominations',
        content: 'Nomination guidelines to follow.',
        status: 'DRAFT',
        authorId: officers.vp.user!.id,
      },
    ],
  });

  await prisma.notification.createMany({
    data: [
      { userId: demoMember.user!.id, type: 'CERTIFICATE_AVAILABLE', title: 'Certificate available', body: 'Your certificate for "CCIS Foundation Anniversary" is ready.', link: '/certificates', createdAt: at(-18 * day), readAt: at(-17 * day) },
      { userId: demoMember.user!.id, type: 'ANNOUNCEMENT_PUBLISHED', title: 'New announcement', body: 'Hackathon 2026 registration is open', link: '/announcements', createdAt: at(-2 * day) },
      { userId: demoMember.user!.id, type: 'EVENT_REGISTRATION_CONFIRMED', title: 'Registration confirmed', body: `You're registered for "${assembly.name}".`, link: `/events/${assembly.id}`, createdAt: at(-3 * day) },
    ],
  });

  // ─── Audit trail for the seeded state ────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      { actorId: presidentUserId, action: 'auth.login', entityType: 'User', entityId: presidentUserId, createdAt: at(-1 * day) },
      { actorId: secretaryUserId, action: 'event.created', entityType: 'Event', entityId: hackathon.id, metadata: { name: hackathon.name }, createdAt: at(-9 * day) },
      { actorId: secretaryUserId, action: 'event.status_changed', entityType: 'Event', entityId: hackathon.id, metadata: { from: 'DRAFT', to: 'PUBLISHED' }, createdAt: at(-8 * day) },
      { actorId: treasurerUserId, action: 'budget.created', entityType: 'Budget', entityId: hackathonBudget.id, metadata: { name: 'Hackathon 2026', allocatedAmount: '50000.00' }, createdAt: at(-7 * day) },
      { actorId: presidentUserId, action: 'announcement.published', entityType: 'Announcement', metadata: { title: 'Hackathon 2026 registration is open' }, createdAt: at(-2 * day) },
    ],
  });

  console.log(`Demo data created. Sign in with any of these (password: ${DEMO_PASSWORD}):`);
  for (const email of ['adviser', 'president', 'vp', 'secretary', 'asst.secretary', 'treasurer', 'asst.treasurer', 'auditor', 'pio', 'rep', 'member']) {
    console.log(`  ${email}@itsoc.test`);
  }
};

/**
 * ITSoc's extra officer roles (assistant secretary/treasurer, P.I.O., section
 * representative). Separate from seedDemoData and keyed by email so it also
 * fills in databases that were seeded before these roles existed.
 */
const EXTRA_OFFICERS = [
  { email: 'asst.secretary@itsoc.test', firstName: 'Bea', lastName: 'Ramos', role: 'ASSISTANT_SECRETARY', position: 'Assistant Secretary', yearLevel: 2, section: 'A' },
  { email: 'asst.treasurer@itsoc.test', firstName: 'Carlo', lastName: 'Mendoza', role: 'ASSISTANT_TREASURER', position: 'Assistant Treasurer', yearLevel: 2, section: 'B' },
  { email: 'pio@itsoc.test', firstName: 'Dana', lastName: 'Reyes', role: 'PIO', position: 'P.I.O.', yearLevel: 3, section: 'A' },
  { email: 'rep@itsoc.test', firstName: 'Enzo', lastName: 'Garcia', role: 'REPRESENTATIVE', position: 'Section Representative', yearLevel: 1, section: 'A' },
  // The organization's faculty adviser (an administrator, not a student).
  {
    email: 'adviser@itsoc.test',
    firstName: 'Gerald Mc Klein',
    middleName: 'G.',
    lastName: 'Agustin',
    role: 'ADVISER',
    position: 'Adviser',
    yearLevel: 4,
    section: null,
    course: 'Faculty Adviser',
  },
] as const;

const seedExtraOfficers = async () => {
  const roles = Object.fromEntries((await prisma.role.findMany()).map((role) => [role.name, role.id])) as Record<RoleName, string>;
  const positions = Object.fromEntries((await prisma.position.findMany()).map((p) => [p.name, p.id]));
  const president = await prisma.user.findFirst({ where: { role: { name: 'PRESIDENT' }, status: 'ACTIVE' }, select: { id: true } });
  if (!president) return;
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const termStart = dateOnly(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000));
  let seq = 9000;
  for (const officer of EXTRA_OFFICERS) {
    seq += 1;
    if (await prisma.member.findUnique({ where: { email: officer.email } })) continue;
    const member = await prisma.member.create({
      data: {
        studentId: `2024-${seq}`,
        firstName: officer.firstName,
        middleName: 'middleName' in officer ? officer.middleName : null,
        lastName: officer.lastName,
        email: officer.email,
        course: 'course' in officer ? officer.course : 'BS Information Technology',
        yearLevel: officer.yearLevel,
        section: officer.section,
        user: { create: { roleId: roles[officer.role], status: 'ACTIVE', passwordHash } },
      },
    });
    await prisma.positionAssignment.create({
      data: { memberId: member.id, positionId: positions[officer.position], startDate: termStart, assignedById: president.id },
    });
  }
};

const main = async () => {
  await seedReferenceData(prisma);
  console.log('Reference data synced (roles, permissions, organization, positions).');
  const demo = process.env.SEED_DEMO ?? (process.env.NODE_ENV === 'production' ? '0' : '1');
  if (demo === '1') {
    await seedDemoData();
    await seedExtraOfficers();
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
