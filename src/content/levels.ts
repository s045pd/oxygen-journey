import type { LevelDef, LevelId } from '../types';

export const LEVELS: LevelDef[] = [
  {
    id: 'breathe',
    roman: 'I',
    title: 'Breathe In',
    scaleLabel: 'x1 WHOLE BODY',
    tourText: 'Your journey begins with a single breath. Air rushes through your nose and mouth, travelling down the trachea towards your lungs. This is the start of respiration—the process that keeps every cell in your body alive.',
    yourTurn: 'Hold SPACE (or the Hold button) to breathe in. Watch your chest expand as the diaphragm contracts and pulls air into the lungs.',
    controlKind: 'hold',
    controlLabel: 'Hold to inhale',
    quiz: [
      {
        question: 'What muscle contracts to draw air into the lungs?',
        options: ['Biceps', 'Diaphragm', 'Heart', 'Intercostal muscles only'],
        correctIndex: 1
      },
      {
        question: 'Air travels from the mouth to the lungs via the:',
        options: ['Oesophagus', 'Trachea', 'Aorta', 'Bronchioles'],
        correctIndex: 1
      }
    ]
  },
  {
    id: 'tree',
    roman: 'II',
    title: 'Bronchial Tree',
    scaleLabel: 'x10 AIRWAYS',
    tourText: 'Inside your lungs, the airways branch like an upside-down tree. The trachea splits into two bronchi, which divide again and again into smaller bronchioles. This branching pattern maximises the surface area for gas exchange.',
    yourTurn: 'Drag to rotate the bronchial tree. Notice how each branch gets progressively smaller, ending in tiny air sacs called alveoli.',
    controlKind: 'drag',
    controlLabel: 'Drag to rotate',
    quiz: [
      {
        question: 'The trachea first divides into:',
        options: ['Alveoli', 'Two main bronchi', 'Capillaries', 'Bronchioles'],
        correctIndex: 1
      },
      {
        question: 'Why does the airway branch repeatedly?',
        options: ['To slow air down', 'To increase surface area', 'To filter dust', 'To warm the air'],
        correctIndex: 1
      }
    ]
  },
  {
    id: 'unfold',
    roman: 'III',
    title: 'Alveoli Unfold',
    scaleLabel: 'x1000 ALVEOLI',
    tourText: 'At the end of each bronchiole sit clusters of alveoli—tiny air sacs with walls just one cell thick. If you could flatten out all 300 million alveoli in your lungs, they would cover a tennis court!',
    yourTurn: 'Tap SPACE to unfold the alveoli and reveal their grape-like structure. Each one is wrapped in a network of capillaries.',
    controlKind: 'tap',
    controlLabel: 'Tap to unfold',
    quiz: [
      {
        question: 'Approximately how many alveoli are in human lungs?',
        options: ['3 thousand', '30 thousand', '300 million', '3 billion'],
        correctIndex: 2
      },
      {
        question: 'Alveoli walls are:',
        options: ['Several cells thick', 'One cell thick', 'Made of muscle', 'Made of bone'],
        correctIndex: 1
      }
    ]
  },
  {
    id: 'swap',
    roman: 'IV',
    title: 'Gas Exchange',
    scaleLabel: 'x10000 MEMBRANE',
    tourText: 'Here at the alveolar membrane, the magic happens. Oxygen diffuses from the air into the blood, while carbon dioxide moves the opposite way. This exchange happens because gases move from high to low concentration—a process called diffusion.',
    yourTurn: 'Hold SPACE to boost oxygen diffusion. Use the slider to adjust membrane thickness and see how it affects exchange rate.',
    controlKind: 'hold',
    controlLabel: 'Hold for O₂ diffusion',
    extraSlider: { label: 'Membrane thickness', initial: 0.3 },
    quiz: [
      {
        question: 'Gas exchange relies on which process?',
        options: ['Active transport', 'Diffusion', 'Osmosis', 'Filtration'],
        correctIndex: 1
      },
      {
        question: 'A thinner membrane makes diffusion:',
        options: ['Slower', 'Faster', 'Stop completely', 'Unchanged'],
        correctIndex: 1
      }
    ]
  },
  {
    id: 'ride',
    roman: 'V',
    title: 'Haemoglobin Ride',
    scaleLabel: 'x100000 BLOOD',
    tourText: 'Oxygen doesn\'t travel alone in your blood. It hitches a ride on haemoglobin molecules inside red blood cells. Each haemoglobin can carry four oxygen molecules, turning the blood bright red.',
    yourTurn: 'Use the slider to adjust oxygen levels. Watch haemoglobin change colour from dark purple (deoxygenated) to bright red (oxygenated).',
    controlKind: 'slider',
    controlLabel: 'Adjust O₂ saturation',
    quiz: [
      {
        question: 'How many oxygen molecules can one haemoglobin carry?',
        options: ['One', 'Two', 'Four', 'Eight'],
        correctIndex: 2
      },
      {
        question: 'Oxygenated blood appears:',
        options: ['Blue', 'Dark purple', 'Bright red', 'Yellow'],
        correctIndex: 2
      }
    ]
  },
  {
    id: 'pump',
    roman: 'VI',
    title: 'Heart Pump',
    scaleLabel: 'x10 HEART',
    tourText: 'Your heart is a tireless pump, beating around 100,000 times per day. The right side receives deoxygenated blood and sends it to the lungs. The left side receives oxygenated blood from the lungs and pumps it to the body.',
    yourTurn: 'Tap SPACE to trigger heartbeats. Watch how the four chambers contract in sequence to move blood efficiently.',
    controlKind: 'tap',
    controlLabel: 'Tap to beat',
    quiz: [
      {
        question: 'Which side of the heart pumps blood to the lungs?',
        options: ['Left side', 'Right side', 'Both equally', 'Neither'],
        correctIndex: 1
      },
      {
        question: 'The heart has how many chambers?',
        options: ['Two', 'Three', 'Four', 'Five'],
        correctIndex: 2
      }
    ]
  },
  {
    id: 'loops',
    roman: 'VII',
    title: 'Double Loop',
    scaleLabel: 'x1 BODY',
    tourText: 'Humans have a double circulatory system. The pulmonary loop carries blood between heart and lungs. The systemic loop carries blood between heart and body. This separation keeps oxygenated and deoxygenated blood from mixing.',
    yourTurn: 'Drag to rotate the circulation model. Trace the two loops: blue vessels carry deoxygenated blood, red carry oxygenated.',
    controlKind: 'drag',
    controlLabel: 'Drag to rotate',
    quiz: [
      {
        question: 'The pulmonary loop connects the heart to the:',
        options: ['Brain', 'Lungs', 'Legs', 'Stomach'],
        correctIndex: 1
      },
      {
        question: 'A double circulatory system prevents:',
        options: ['Blood clotting', 'Mixing of oxygenated and deoxygenated blood', 'Heart attacks', 'Breathing'],
        correctIndex: 1
      }
    ]
  },
  {
    id: 'burn',
    roman: 'VIII',
    title: 'Cell Respiration',
    scaleLabel: 'x1000000 CELL',
    tourText: 'Inside every cell, mitochondria use oxygen to release energy from glucose. This is aerobic respiration: glucose + oxygen → carbon dioxide + water + energy (ATP). Without this process, your cells couldn\'t function.',
    yourTurn: 'Hold SPACE to supply oxygen. Use the slider to adjust glucose levels. Both are needed for respiration to occur!',
    controlKind: 'hold',
    controlLabel: 'Hold for O₂ supply',
    extraSlider: { label: 'Glucose', initial: 0.5 },
    quiz: [
      {
        question: 'Aerobic respiration occurs in which organelle?',
        options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Cell membrane'],
        correctIndex: 2
      },
      {
        question: 'The products of aerobic respiration are:',
        options: ['Glucose and oxygen', 'Carbon dioxide, water and ATP', 'Only ATP', 'Lactic acid'],
        correctIndex: 1
      }
    ]
  },
  {
    id: 'run',
    roman: 'IX',
    title: 'Exercise Response',
    scaleLabel: 'x1 BODY',
    tourText: 'When you exercise, your muscles demand more oxygen. Your body responds by breathing faster, heart beating quicker, and blood vessels dilating. This coordinated response delivers oxygen where it\'s needed most.',
    yourTurn: 'Use the slider to increase exercise intensity. Watch how breathing rate, heart rate and blood flow all increase together.',
    controlKind: 'slider',
    controlLabel: 'Adjust exercise intensity',
    quiz: [
      {
        question: 'During exercise, breathing rate:',
        options: ['Decreases', 'Stays the same', 'Increases', 'Stops'],
        correctIndex: 2
      },
      {
        question: 'Blood vessels dilate during exercise to:',
        options: ['Reduce blood flow', 'Increase oxygen delivery', 'Lower body temperature', 'Save energy'],
        correctIndex: 1
      }
    ]
  },
  {
    id: 'out',
    roman: 'X',
    title: 'Breathe Out',
    scaleLabel: 'x1 LAB',
    tourText: 'Your journey ends where it began—with a breath, but now going out. The carbon dioxide produced by your cells has travelled back through your blood, to your lungs, and out into the air. The cycle continues with every breath you take.',
    yourTurn: 'Hold SPACE to exhale completely. Watch the CO₂ leave your body, completing the respiratory cycle.',
    controlKind: 'hold',
    controlLabel: 'Hold to exhale',
    quiz: [
      {
        question: 'Carbon dioxide is removed from the body via the:',
        options: ['Skin', 'Kidneys', 'Lungs', 'Liver'],
        correctIndex: 2
      },
      {
        question: 'The respiratory cycle ensures cells receive:',
        options: ['Only glucose', 'Only oxygen', 'Oxygen and remove CO₂', 'Nothing'],
        correctIndex: 2
      }
    ]
  }
];

export function getLevelIndex(id: LevelId): number {
  return LEVELS.findIndex(l => l.id === id);
}