import type { LevelDef, LevelId, LevelPhase } from '../types';

/**
 * Oxygen Journey — original lesson copy (KS3 / GCSE Biology).
 * Follow one breath of oxygen from the air, through lungs, blood and heart,
 * into a working cell — then back out as carbon dioxide.
 *
 * Copy rules: tour beats ≤ ~110 chars, yourTurn names the exact control,
 * controlLabel fits a phone pill (≤ ~18 chars).
 */

export const LEVELS: readonly LevelDef[] = [
  {
    id: 'breathe',
    roman: 'I',
    title: 'Breathe In',
    tagline: 'Every journey starts with a breath.',
    scaleLabel: '×1 WHOLE BODY',
    scalePower: 0,
    accent: 'cyan',
    tourText: [
      "Lungs can't pull air in by themselves. The muscles around them do the work.",
      'The diaphragm contracts and flattens. Intercostal muscles swing the ribs up and out.',
      'The chest gets bigger, so pressure inside drops below the air outside — and air rushes in.',
    ],
    yourTurn: 'Hold to contract the diaphragm and fill the lungs. Let go to breathe out.',
    controlKind: 'hold',
    controlLabel: 'Hold to inhale',
    readout: { label: 'Lung volume', unit: 'L', min: 0, max: 6, decimals: 1, target: 5 },
    successText: 'Full breath taken. That air is now heading down your windpipe.',
    quiz: [
      {
        prompt: 'When you breathe in, what does your diaphragm do?',
        options: ['Contracts and flattens', 'Relaxes and domes upwards', 'Stays completely still'],
        correctIndex: 0,
        explain: 'Contracting pulls the diaphragm down and flat, making the chest cavity taller.',
      },
      {
        prompt: 'Why does air flow into the lungs as the chest expands?',
        options: [
          'Pressure in the chest rises above the air outside',
          'Pressure in the chest falls below the air outside',
          'The lungs have their own muscles that suck air in',
        ],
        correctIndex: 1,
        explain: 'More volume means lower pressure. Air moves from higher pressure to lower pressure.',
      },
    ],
  },
  {
    id: 'tree',
    roman: 'II',
    title: 'The Tree',
    tagline: 'One pipe becomes millions.',
    scaleLabel: '×10 AIRWAYS',
    scalePower: 1,
    accent: 'violet',
    tourText: [
      'Air enters the trachea — your windpipe — held open by C-shaped rings of cartilage.',
      'It splits into two bronchi, one per lung, then into thousands of narrower bronchioles.',
      'Sticky mucus traps dust and microbes. Tiny hairs called cilia sweep it up and away.',
    ],
    yourTurn: 'Tap to split the airways. Keep branching until you reach the air sacs.',
    controlKind: 'tap',
    controlLabel: 'Tap to branch',
    readout: { label: 'Generation', unit: 'of 23', min: 0, max: 23, decimals: 0, target: 23 },
    successText: 'Twenty-three splits deep. The airways end in clusters of tiny sacs.',
    quiz: [
      {
        prompt: 'Which order does inhaled air travel through?',
        options: [
          'Trachea → bronchi → bronchioles → alveoli',
          'Bronchioles → trachea → alveoli → bronchi',
          'Alveoli → bronchi → trachea → bronchioles',
        ],
        correctIndex: 0,
        explain: 'Big pipe to small: trachea, then bronchi, then bronchioles, ending at the alveoli.',
      },
      {
        prompt: 'What stops the trachea collapsing when you breathe in?',
        options: ['A coating of mucus', 'Rings of cartilage', 'The cilia'],
        correctIndex: 1,
        explain: 'Stiff cartilage rings hold the trachea open, like the ridges on a vacuum-cleaner hose.',
      },
    ],
  },
  {
    id: 'unfold',
    roman: 'III',
    title: 'Unfold',
    tagline: 'A badminton court folded into your chest.',
    scaleLabel: '×10³ ALVEOLI',
    scalePower: 3,
    accent: 'magenta',
    tourText: [
      'Each bronchiole ends in clusters of tiny air sacs called alveoli — hundreds of millions of them.',
      'Spread flat, their walls would cover about 70 m² — close to a whole badminton court.',
      'Huge area, walls one cell thick and a dense net of capillaries: built for fast gas exchange.',
    ],
    yourTurn: 'Drag the slider to unfold the alveoli and watch the surface area grow.',
    controlKind: 'slider',
    controlLabel: 'Unfold',
    readout: { label: 'Surface area', unit: 'm²', min: 0, max: 70, decimals: 0, target: 70 },
    successText: 'Fully unfolded: about 70 m² of exchange surface, packed inside your ribs.',
    quiz: [
      {
        prompt: 'Why do the lungs need such a large surface area?',
        options: [
          'So more gas can diffuse at the same time',
          'To make the lungs heavier and more stable',
          'To store extra oxygen for later',
        ],
        correctIndex: 0,
        explain: 'More surface means more gas molecules can cross at once, so exchange is faster.',
      },
      {
        prompt: 'How thick is the wall of an alveolus?',
        options: ['About one centimetre', 'Just one cell thick', 'Several layers of muscle'],
        correctIndex: 1,
        explain: 'A one-cell-thick wall keeps the diffusion distance tiny.',
      },
    ],
  },
  {
    id: 'swap',
    roman: 'IV',
    title: 'The Swap',
    tagline: 'Oxygen in, carbon dioxide out.',
    scaleLabel: '×10⁴ MEMBRANE',
    scalePower: 4,
    accent: 'cyan',
    tourText: [
      'Alveolus wall and capillary wall sit side by side — together under a thousandth of a millimetre.',
      'Oxygen diffuses from the air, where it is concentrated, into the blood, where it is scarce.',
      'Carbon dioxide goes the other way. Breathing and blood flow keep both gradients steep.',
    ],
    yourTurn: 'Hold to ventilate and keep the gradient steep. Then thicken the wall and compare the rate.',
    controlKind: 'hold',
    controlLabel: 'Hold to ventilate',
    extraSlider: { label: 'Wall thickness', initial: 0.15 },
    readout: { label: 'Diffusion rate', unit: '%', min: 0, max: 100, decimals: 0, target: 80 },
    successText: 'Steep gradient plus a thin wall — oxygen floods into the blood.',
    quiz: [
      {
        prompt: 'Why does oxygen move from the alveolus into the blood?',
        options: [
          'The blood pumps it in',
          'Oxygen concentration is higher in the alveolus',
          'Oxygen always moves towards the heart',
        ],
        correctIndex: 1,
        explain: 'Diffusion is the net movement of particles from a higher to a lower concentration.',
      },
      {
        prompt: 'Which change would slow down gas exchange?',
        options: ['A thicker exchange wall', 'Faster breathing', 'More capillaries'],
        correctIndex: 0,
        explain: 'A thicker barrier means a longer diffusion distance, so gases cross more slowly.',
      },
    ],
  },
  {
    id: 'ride',
    roman: 'V',
    title: 'The Ride',
    tagline: 'Hitching a lift on a red blood cell.',
    scaleLabel: '×10⁵ BLOOD',
    scalePower: 5,
    accent: 'crimson',
    tourText: [
      'Red blood cells are packed with haemoglobin, a protein that picks up oxygen in the lungs.',
      'Haemoglobin + oxygen makes oxyhaemoglobin — which is why oxygen-rich blood is bright red.',
      'No nucleus and a biconcave disc shape: more room for haemoglobin, more surface for oxygen.',
    ],
    yourTurn: 'Drag on the stage to sweep red blood cells past the alveolus and load them with oxygen.',
    controlKind: 'drag',
    controlLabel: 'Drag cells',
    readout: { label: 'Oxygen loaded', unit: '%', min: 0, max: 100, decimals: 0, target: 95 },
    successText: 'Cells saturated. Bright red blood is ready to leave the lungs.',
    quiz: [
      {
        prompt: 'Which substance in red blood cells carries oxygen?',
        options: ['Plasma', 'Haemoglobin', 'Glucose'],
        correctIndex: 1,
        explain: 'Haemoglobin binds oxygen in the lungs and releases it in the tissues.',
      },
      {
        prompt: 'How does having no nucleus help a red blood cell?',
        options: [
          'It leaves more space for haemoglobin',
          'It lets the cell divide faster',
          'It makes the cell stick to vessel walls',
        ],
        correctIndex: 0,
        explain: 'Without a nucleus there is more room for haemoglobin, so more oxygen per cell.',
      },
    ],
  },
  {
    id: 'pump',
    roman: 'VI',
    title: 'The Pump',
    tagline: 'Four chambers, one beat.',
    scaleLabel: '×10 HEART',
    scalePower: 1,
    accent: 'crimson',
    tourText: [
      'Your heart is two pumps side by side: the right side feeds the lungs, the left side the body.',
      'Atria on top receive blood. Ventricles below squeeze it out. Valves snap shut to stop backflow.',
      'The left ventricle has the thickest wall — it pushes blood all the way round your body.',
    ],
    yourTurn: 'Tap a steady rhythm to make the heart beat. Reach a resting rate of about 60 bpm.',
    controlKind: 'tap',
    controlLabel: 'Tap to beat',
    readout: { label: 'Heart rate', unit: 'bpm', min: 0, max: 180, decimals: 0, target: 60 },
    successText: 'Lub-dub. Those two sounds are the heart valves snapping shut.',
    quiz: [
      {
        prompt: 'Which chamber pumps oxygenated blood out to the body?',
        options: ['Right atrium', 'Left ventricle', 'Right ventricle'],
        correctIndex: 1,
        explain: 'The left ventricle pumps oxygen-rich blood into the aorta, so its wall is thickest.',
      },
      {
        prompt: 'What is the job of the heart valves?',
        options: ['To add oxygen to the blood', 'To stop blood flowing backwards', 'To control breathing rate'],
        correctIndex: 1,
        explain: 'Valves only open one way, so blood keeps moving forwards through the heart.',
      },
    ],
  },
  {
    id: 'loops',
    roman: 'VII',
    title: 'Two Loops',
    tagline: 'Through the heart twice per lap.',
    scaleLabel: '×1 CIRCULATION',
    scalePower: 0,
    accent: 'violet',
    tourText: [
      'Humans have a double circulation: one loop to the lungs, one loop round the rest of the body.',
      'The pulmonary artery takes deoxygenated blood to the lungs; the pulmonary vein brings it back.',
      'The aorta sends oxygen-rich blood out at high pressure. Veins return it to the heart.',
    ],
    yourTurn: 'Slide to set the blood speed, then follow one cell round both loops.',
    controlKind: 'slider',
    controlLabel: 'Blood speed',
    readout: { label: 'Loops done', unit: 'of 2', min: 0, max: 2, decimals: 0, target: 2 },
    successText: 'Lungs, heart, body, heart. One full lap means two trips through the heart.',
    quiz: [
      {
        prompt: "Why is human circulation called a 'double' circulation?",
        options: [
          'Blood passes through the heart twice per full circuit',
          'Humans have two separate hearts',
          'Blood flows both ways in each vessel',
        ],
        correctIndex: 0,
        explain: 'One loop runs heart → lungs → heart; the other runs heart → body → heart.',
      },
      {
        prompt: 'What does the pulmonary artery carry?',
        options: [
          'Oxygenated blood to the body',
          'Deoxygenated blood to the lungs',
          'Oxygenated blood to the lungs',
        ],
        correctIndex: 1,
        explain: 'Arteries carry blood away from the heart. This one takes oxygen-poor blood to the lungs.',
      },
    ],
  },
  {
    id: 'burn',
    roman: 'VIII',
    title: 'Burn',
    tagline: 'Where the oxygen finally gets used.',
    scaleLabel: '×10⁶ CELL',
    scalePower: 6,
    accent: 'amber',
    tourText: [
      'Inside your cells, mitochondria use oxygen to transfer energy from glucose.',
      'Aerobic respiration: glucose + oxygen → carbon dioxide + water, with energy released.',
      'That energy powers muscle contraction, builds new molecules and keeps you warm.',
    ],
    yourTurn: 'Hold to deliver oxygen to the mitochondria. Set the glucose supply and watch the energy output.',
    controlKind: 'hold',
    controlLabel: 'Hold to deliver O₂',
    extraSlider: { label: 'Glucose supply', initial: 0.6 },
    readout: { label: 'Energy released', unit: '%', min: 0, max: 100, decimals: 0, target: 80 },
    successText: 'Mitochondria running hot. Waste carbon dioxide is already leaving the cell.',
    quiz: [
      {
        prompt: 'Where in the cell does aerobic respiration mainly happen?',
        options: ['Nucleus', 'Mitochondria', 'Cell membrane'],
        correctIndex: 1,
        explain: 'Mitochondria are where most aerobic respiration takes place.',
      },
      {
        prompt: 'What are the products of aerobic respiration?',
        options: ['Glucose and oxygen', 'Carbon dioxide and water', 'Lactic acid only'],
        correctIndex: 1,
        explain: 'Glucose and oxygen go in; carbon dioxide and water come out, with energy transferred.',
      },
    ],
  },
  {
    id: 'run',
    roman: 'IX',
    title: 'Run!',
    tagline: 'When demand outruns supply.',
    scaleLabel: '×1 ATHLETE',
    scalePower: 0,
    accent: 'amber',
    tourText: [
      'Exercise makes muscles respire faster, so heart rate and breathing rate rise to deliver more oxygen.',
      "Push too hard and oxygen can't arrive fast enough. Muscles switch to anaerobic respiration.",
      'Glucose → lactic acid. Muscles tire, and afterwards you pant to repay the oxygen debt.',
    ],
    yourTurn: 'Slide to set the running pace. Watch heart rate climb and spot when muscles go anaerobic.',
    controlKind: 'slider',
    controlLabel: 'Running pace',
    readout: { label: 'Heart rate', unit: 'bpm', min: 60, max: 190, decimals: 0, target: 160 },
    successText: 'Flat out. Lactic acid is building — that burning feeling is the oxygen debt growing.',
    quiz: [
      {
        prompt: 'What do muscles produce during anaerobic respiration?',
        options: ['Lactic acid', 'Oxygen', 'Extra haemoglobin'],
        correctIndex: 0,
        explain: 'Without enough oxygen, muscle cells break glucose down into lactic acid, releasing less energy.',
      },
      {
        prompt: 'Why do you keep breathing hard after a sprint?',
        options: [
          'To cool down the lungs',
          'To repay the oxygen debt and break down lactic acid',
          'To refill the stomach with air',
        ],
        correctIndex: 1,
        explain: 'Extra oxygen is needed afterwards to deal with the lactic acid that built up.',
      },
    ],
  },
  {
    id: 'out',
    roman: 'X',
    title: 'Out',
    tagline: 'The return trip ends with a breath out.',
    scaleLabel: '×1 LAB TEST',
    scalePower: 0,
    accent: 'cyan',
    tourText: [
      'Carbon dioxide from your cells rides back in the blood and diffuses into the alveoli.',
      'Breathing out: the diaphragm relaxes and domes up, the ribs drop, and air is pushed out.',
      'Test it: breathe out through limewater. Carbon dioxide turns it cloudy; fresh air barely does.',
    ],
    yourTurn: 'Hold to breathe out through the limewater. Keep going until it turns cloudy.',
    controlKind: 'hold',
    controlLabel: 'Hold to exhale',
    readout: { label: 'Cloudiness', unit: '%', min: 0, max: 100, decimals: 0, target: 90 },
    successText: 'Milky limewater — proof your breath is carrying carbon dioxide out.',
    quiz: [
      {
        prompt: 'What happens when carbon dioxide bubbles through limewater?',
        options: ['It turns cloudy (milky)', 'It turns bright blue', 'It starts to boil'],
        correctIndex: 0,
        explain: 'Limewater goes cloudy with carbon dioxide — the classic test for the gas.',
      },
      {
        prompt: 'Compared with the air you breathe in, the air you breathe out has…',
        options: [
          'More oxygen and less carbon dioxide',
          'Less oxygen and more carbon dioxide',
          'Exactly the same gases',
        ],
        correctIndex: 1,
        explain: 'Inhaled air is about 0.04% carbon dioxide; exhaled air is around 4%, with less oxygen.',
      },
    ],
  },
];

export const LEVEL_COUNT = LEVELS.length;

export function getLevel(id: LevelId): LevelDef {
  const found = LEVELS.find((l) => l.id === id);
  if (!found) throw new Error(`Unknown level: ${id}`);
  return found;
}

export function getLevelIndex(id: LevelId): number {
  return LEVELS.findIndex((l) => l.id === id);
}

export function nextLevelId(id: LevelId): LevelId | null {
  const i = getLevelIndex(id);
  return i >= 0 && i < LEVELS.length - 1 ? LEVELS[i + 1].id : null;
}

const PHASE_LABELS: Readonly<Record<LevelPhase, string>> = { tour: 'Tour', handsOn: 'Try', check: 'Check' };

/** UI copy outside individual levels. */
export const COPY = {
  appTitle: 'Oxygen Journey',
  appKicker: 'SkillBay · Biology',
  splashSub:
    'Follow one breath of oxygen from the air you inhale to a working muscle cell — and watch the waste head back out.',
  splashHint: 'Ten stages · about 15 minutes · KS3 & GCSE',
  start: 'Begin the journey',
  loading: 'Building the studio…',
  phaseLabels: PHASE_LABELS,
  tourKicker: 'TOUR',
  yourTurnKicker: 'YOUR TURN',
  successKicker: 'NICE WORK',
  next: 'Next',
  back: 'Back',
  tryIt: 'Try it',
  check: 'Check',
  quizKicker: 'CHECK',
  quizNext: 'Next question',
  quizFinish: 'Continue',
  correct: 'Correct',
  notQuite: 'Not quite',
  nextStage: 'Next stage',
  finishTitle: 'Journey complete',
  finishSub:
    'Air in, through the tree, across the membrane, round both loops, burned in a cell — and breathed back out.',
  restart: 'Start again',
  tourKeyHint: 'SPACE ›',
  keysHint: 'Space · next / hold / tap    Enter · skip    ← → · stages    M · sound',
  scoreLabel: 'Check answers correct',
  dragOnStage: 'on stage',
} as const;