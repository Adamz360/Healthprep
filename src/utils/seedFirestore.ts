// src/utils/seedFirestore.ts
// One-time script to push ALL seed data to Firestore.
// Run from browser console after signing in as admin.

import { doc, setDoc, getDocs, collection } from 'firebase/firestore';

import { firestore } from '../firebase';

interface SeedTopicDef {
  name: string;
}

interface SeedSubjectDef {
  name: string;
  slug: string;
  creditsToUnlockMock: number;
  topics: SeedTopicDef[];
}

interface SeedCourseDef {
  name: string;
  slug: string;
  description: string;
  subjects: SeedSubjectDef[];
}

interface SeedDepartmentDef {
  slug: string;
  name: string;
  description: string;
  iconName: string;
  courses: SeedCourseDef[];
}

function uid(prefix = ''): string {
  const rand = crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return prefix ? `${prefix}_${rand}` : rand;
}

const SEED_DEPARTMENTS: SeedDepartmentDef[] = [
  {
    slug: 'nursing',
    name: 'Nursing',
    description: 'RN / RM exam preparation covering the full nursing curriculum.',
    iconName: 'Stethoscope',
    courses: [
      {
        name: 'Nursing Level 1 — Foundation',
        slug: 'nursing-level-1',
        description: 'First-year nursing fundamentals.',
        subjects: [
          {
            name: 'Anatomy & Physiology',
            slug: 'nursing-anatomy-physiology',
            creditsToUnlockMock: 20,
            topics: [
              { name: 'Cardiovascular System' },
              { name: 'Respiratory System' },
              { name: 'Nervous System' },
              { name: 'Musculoskeletal System' },
            ],
          },
          {
            name: 'Pharmacology',
            slug: 'nursing-pharmacology',
            creditsToUnlockMock: 20,
            topics: [
              { name: 'Antibiotics' },
              { name: 'Analgesics' },
              { name: 'Cardiac Drugs' },
              { name: 'Drug Calculations' },
            ],
          },
        ],
      },
      {
        name: 'Nursing Level 2 — Clinical',
        slug: 'nursing-level-2',
        description: 'Second-year clinical nursing.',
        subjects: [
          {
            name: 'Medical-Surgical Nursing',
            slug: 'nursing-med-surg',
            creditsToUnlockMock: 25,
            topics: [
              { name: 'Perioperative Care' },
              { name: 'Wound Management' },
              { name: 'Oncology Nursing' },
            ],
          },
          {
            name: 'Obstetrics',
            slug: 'nursing-obstetrics',
            creditsToUnlockMock: 20,
            topics: [
              { name: 'Antenatal Care' },
              { name: 'Labor & Delivery' },
              { name: 'Postpartum Care' },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'community-health',
    name: 'Community Health (CHEW / JCHEW)',
    description: 'Community Health Extension Worker board exam preparation.',
    iconName: 'HeartPulse',
    courses: [
      {
        name: 'CHEW Core Programme',
        slug: 'chew-core',
        description: 'Full CHEW curriculum.',
        subjects: [
          {
            name: 'Primary Health Care',
            slug: 'chew-primary-health-care',
            creditsToUnlockMock: 15,
            topics: [
              { name: 'PHC Principles' },
              { name: 'Health Education' },
              { name: 'Environmental Health' },
            ],
          },
          {
            name: 'Reproductive Health',
            slug: 'chew-reproductive-health',
            creditsToUnlockMock: 15,
            topics: [
              { name: 'Family Planning' },
              { name: 'Antenatal Care' },
              { name: 'STI Management' },
            ],
          },
          {
            name: 'Child Health',
            slug: 'chew-child-health',
            creditsToUnlockMock: 15,
            topics: [
              { name: 'Immunization' },
              { name: 'Growth Monitoring' },
              { name: 'Nutrition' },
            ],
          },
          {
            name: 'Communicable Diseases',
            slug: 'chew-communicable-diseases',
            creditsToUnlockMock: 15,
            topics: [
              { name: 'Malaria' },
              { name: 'Tuberculosis' },
              { name: 'HIV/AIDS' },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: 'pharm-tech',
    name: 'Pharmacy Technician',
    description: 'Pharmacy Technician licensing exam preparation.',
    iconName: 'Pill',
    courses: [
      {
        name: 'Pharm Tech Core Programme',
        slug: 'pharmtech-core',
        description: 'Full pharmacy technician curriculum.',
        subjects: [
          {
            name: 'Pharmacology',
            slug: 'pharmtech-pharmacology',
            creditsToUnlockMock: 20,
            topics: [
              { name: 'Antibiotics' },
              { name: 'Drug Classification' },
              { name: 'Adverse Drug Reactions' },
            ],
          },
          {
            name: 'Pharmaceutics',
            slug: 'pharmtech-pharmaceutics',
            creditsToUnlockMock: 20,
            topics: [
              { name: 'Dosage Forms' },
              { name: 'Compounding' },
            ],
          },
          {
            name: 'Clinical Pharmacy',
            slug: 'pharmtech-clinical-pharmacy',
            creditsToUnlockMock: 20,
            topics: [
              { name: 'Patient Counselling' },
              { name: 'Drug Interactions' },
            ],
          },
          {
            name: 'Drug Store Management',
            slug: 'pharmtech-drug-store-mgmt',
            creditsToUnlockMock: 15,
            topics: [
              { name: 'Inventory Control' },
              { name: 'Regulatory Compliance' },
            ],
          },
        ],
      },
    ],
  },
];

function buildSampleQuestions(
  subjectId: string,
  departmentId: string,
  topicId: string,
  topicName: string,
  count = 5,
) {
  return Array.from({ length: count }, (_, i) => ({
    id: uid('q'),
    subjectId,
    topicId,
    departmentId,
    stem: `[Sample] ${topicName} — practice question #${i + 1}. Replace with real content bank.`,
    options: [
      { key: 'A', text: 'Option A' },
      { key: 'B', text: 'Option B' },
      { key: 'C', text: 'Option C' },
      { key: 'D', text: 'Option D' },
    ],
    correctOptionKey: (['A', 'B', 'C', 'D'] as const)[(i + 1) % 4],
    explanation: `Placeholder explanation for ${topicName} question #${i + 1}.`,
    difficulty: (['easy', 'medium', 'hard'] as const)[(i + 1) % 3],
    tags: [topicName],
    createdAt: new Date().toISOString(),
  }));
}

const MOCK_LEADERBOARD_NAMES = [
  'Amaka Obi', 'Chinedu Eze', 'Fatima Bello', 'Ibrahim Suleiman',
  'Ngozi Adeyemi', 'Tunde Bakare', 'Blessing Okoro', 'Yusuf Aliyu',
  'Chiamaka Nwosu', 'Emeka Onyekwere', 'Zainab Mohammed', 'Grace Effiong',
];

export async function seedAllToFirestore(): Promise<void> {
  console.log('🌱 Checking Firestore...');

  // Check if already seeded
  const existingQuestions = await getDocs(collection(firestore, 'questions'));

  if (existingQuestions.size > 0) {
    console.log(`✅ Firestore already has ${existingQuestions.size} questions. Skipping seed.`);
    return;
  }

  console.log('🌱 Seeding Firestore...');

  for (const deptDef of SEED_DEPARTMENTS) {
    const departmentId = uid('dept');
    const allSubjectIds: string[] = [];

    for (const courseDef of deptDef.courses) {
      const courseId = uid('course');
      const subjectIds: string[] = [];

      for (const subjectDef of courseDef.subjects) {
        const subjectId = uid('subj');
        const topicIds: string[] = [];

        for (const topicDef of subjectDef.topics) {
          const topicId = uid('topic');

          await setDoc(doc(firestore, 'topics', topicId), {
            id: topicId,
            subjectId,
            name: topicDef.name,
            parentTopicPath: `${subjectDef.name} -> ${topicDef.name}`,
          });
          topicIds.push(topicId);

          // Sample questions per topic
          const questions = buildSampleQuestions(
            subjectId, departmentId, topicId, topicDef.name,
          );
          for (const q of questions) {
            await setDoc(doc(firestore, 'questions', q.id), q);
          }
          console.log(`  ✅ ${topicDef.name} (${questions.length} questions)`);
        }

        await setDoc(doc(firestore, 'subjects', subjectId), {
          id: subjectId,
          departmentId,
          courseId,
          name: subjectDef.name,
          slug: subjectDef.slug,
          topicIds,
          totalQuestionCount: subjectDef.topics.length * 5,
          isDownloaded: false,
          isActive: true,
          creditsToUnlockMock: subjectDef.creditsToUnlockMock,
        });
        subjectIds.push(subjectId);
        allSubjectIds.push(subjectId);
        console.log(`  📚 Subject: ${subjectDef.name}`);
      }

      await setDoc(doc(firestore, 'courses', courseId), {
        id: courseId,
        departmentId,
        name: courseDef.name,
        slug: courseDef.slug,
        description: courseDef.description,
        isActive: true,
        subjectIds,
        createdAt: new Date().toISOString(),
      });
      console.log(`  📂 Course: ${courseDef.name}`);
    }

    await setDoc(doc(firestore, 'departments', departmentId), {
      id: departmentId,
      slug: deptDef.slug,
      name: deptDef.name,
      description: deptDef.description,
      iconName: deptDef.iconName,
      subjectIds: allSubjectIds,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    console.log(`🏢 Department: ${deptDef.name}`);
  }

  // Seed leaderboard mocks
  const lbSnap = await getDocs(collection(firestore, 'leaderboard_mock'));
  if (lbSnap.empty) {
    for (const name of MOCK_LEADERBOARD_NAMES) {
      await setDoc(doc(firestore, 'leaderboard_mock', uid('lb')), {
        id: uid('lb'),
        displayName: name,
        points: 200 + Math.floor(Math.random() * 900),
      });
    }
    console.log('🏆 Leaderboard mocks seeded');
  }

  console.log('🎉 Firestore seed complete!');
}