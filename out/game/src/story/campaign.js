export const RANKS = [
  { name: 'DOCK HAND', xp: 0 },
  { name: 'RUNNER', xp: 1200 },
  { name: 'WHEELMAN', xp: 3200 },
  { name: 'FIXER', xp: 6800 },
  { name: 'SHOT CALLER', xp: 12000 },
];

export const JOBS = [
  {
    id: 'tide-runner', number: 1, title: 'TIDE RUNNER', giver: 'Mira Kesang',
    briefing: [
      'Mira: The coral Sprint is sitting in the Malecón valet lot with the keys in it.',
      'Take it, shake the PMPD, then bring it to Tavo. Nobody touches the paint.',
    ],
    reward: { cash: 3500, rep: 500 },
    barks: {
      start: 'Mira: Wheelman, go. The tide does not wait.',
      stagePass: 'Mira: Clean. Keep moving.',
      fail: 'Mira: We lost the car. We do not lose it twice.',
      complete: 'Mira: That is the way I hire people. Cash is waiting.',
    },
    stages: [
      {
        objective: 'Steal the coral Calyx Sprint GT from the valet lot',
        nextHint: 'LOSE THE PMPD ON THE BOULEVARD',
        type: 'steal', target: { vehicleType: 'sprint', x: -8, z: -27, colour: '#ff6d55' },
        radius: 10, timer: 0, fail: 'Wasted, busted, or the valet car is destroyed.',
      },
      {
        objective: 'Lose the PMPD on the boulevard',
        nextHint: 'TAKE THE SPRINT TO TAVO',
        type: 'escape', target: { minStars: 1 }, forceWanted: 1,
        radius: 0, timer: 80, fail: 'Busted or the pursuit lasts too long.',
      },
      {
        objective: 'Bring the Sprint to Tavo’s garage',
        nextHint: 'COLLECT YOUR PAY',
        type: 'reach', target: { x: 24, z: 78 }, requiresVehicle: true,
        radius: 12, timer: 0, fail: 'Wasted or busted before the garage.',
      },
    ],
  },
  {
    id: 'salt-market-shakedown', number: 2, title: 'SALT MARKET SHAKEDOWN', giver: 'Kiki Sol',
    briefing: [
      'Kiki: Three Cangrejo dealers are leaning on the stalls in Barrio Sal.',
      'On foot. Make it loud enough that the whole market knows who owns this street.',
    ],
    reward: { cash: 4200, rep: 650 },
    barks: {
      start: 'Kiki: They are by the spice stalls. You know what to do.',
      stagePass: 'Kiki: One down. Two to go.',
      fail: 'Kiki: They scattered. We regroup, we try again.',
      complete: 'Kiki: The market is ours tonight. Nice work, wheelman.',
    },
    stages: [
      {
        objective: 'Walk into the night market',
        nextHint: 'FIND THE CANGREJO DEALERS',
        type: 'reach', target: { x: -190, z: 70 }, radius: 14, timer: 0,
        fail: 'Wasted or busted.',
      },
      {
        objective: 'Intimidate the three Cangrejo dealers',
        nextHint: 'REGROUP WITH KIKI',
        type: 'kill', target: { count: 3, x: -190, z: 70, spread: 7, label: 'Cangrejo dealer' },
        radius: 0, timer: 0, fail: 'Wasted, busted, or a dealer escapes.',
      },
      {
        objective: 'Regroup with Kiki by the market exit',
        nextHint: 'COLLECT YOUR PAY',
        type: 'reach', target: { x: -196, z: 84 }, radius: 10, timer: 0,
        fail: 'Wasted or busted.',
      },
    ],
  },
  {
    id: 'dock-heist', number: 3, title: 'DOCK HEIST', giver: 'Mira Kesang',
    briefing: [
      'Mira: A Marisma van at Puerto Nuevo is carrying the container manifest.',
      'Take the van, outrun a two-star response, and get it to the garage in one piece.',
    ],
    reward: { cash: 6000, rep: 900 },
    barks: {
      start: 'Mira: The docks are watching. Be quick.',
      stagePass: 'Mira: Manifest secured. Now disappear.',
      fail: 'Mira: The van is gone. We will write it off.',
      complete: 'Mira: That manifest is worth more than the whole waterfront.',
    },
    stages: [
      {
        objective: 'Drive to the container docks',
        nextHint: 'FIND THE MANIFEST VAN',
        type: 'reach', target: { x: 178, z: 98 }, radius: 16, timer: 0,
        fail: 'Wasted or busted.',
      },
      {
        objective: 'Steal the manifest van',
        nextHint: 'LOSE THE TWO-STAR RESPONSE',
        type: 'steal', target: { vehicleType: 'van', x: 178, z: 98, colour: '#c6cbc4' },
        radius: 14, timer: 0, fail: 'Wasted, busted, or the van is destroyed.',
      },
      {
        objective: 'Escape the two-star PMPD response',
        nextHint: 'DELIVER THE VAN TO TAVO',
        type: 'escape', target: { minStars: 2 }, forceWanted: 2,
        radius: 0, timer: 110, fail: 'Busted or the pursuit lasts too long.',
      },
      {
        objective: 'Deliver the van to Tavo’s garage',
        nextHint: 'COLLECT YOUR PAY',
        type: 'deliver', target: { x: 24, z: 78, vehicleType: 'van' },
        radius: 14, timer: 0, fail: 'Wasted, busted, or the van is destroyed.',
      },
    ],
  },
  {
    id: 'night-run', number: 4, title: 'NIGHT RUN', giver: 'Mira Kesang',
    briefing: [
      'Mira: A rival crew is running the same package through Corona Heights.',
      'Take the valet car, clear their shooters on the avenue, and beat them to the causeway.',
    ],
    reward: { cash: 8500, rep: 1200 },
    barks: {
      start: 'Mira: Clock is running, Rafa. Drive like it.',
      stagePass: 'Mira: Road is yours. Keep the pedal down.',
      fail: 'Mira: They got the drop on us. Reset.',
      complete: 'Mira: Nobody beats you to a finish line. Nobody.',
    },
    stages: [
      {
        objective: 'Take a fast car from the Malecón',
        nextHint: 'CLEAR THE RIVAL SHOOTERS',
        type: 'steal', target: { vehicleType: 'sprint', x: -8, z: -27 }, allowAny: true,
        radius: 14, timer: 0, fail: 'Wasted, busted, or the car is destroyed.',
      },
      {
        objective: 'Clear the rival shooters on Corona Avenue',
        nextHint: 'RUN THE CAUSEWAY',
        type: 'kill', target: { count: 2, x: 28, z: 194, spread: 9, label: 'rival shooter' },
        radius: 0, timer: 0, fail: 'Wasted, busted, or the shooters escape.',
      },
      {
        objective: 'Deliver the package to the causeway before time runs out',
        nextHint: 'COLLECT YOUR PAY',
        type: 'deliver', target: { x: -330, z: -46 },
        radius: 16, timer: 95, fail: 'Wasted, busted, or time runs out.',
      },
    ],
  },
  {
    id: 'the-informant', number: 5, title: 'THE INFORMANT', giver: 'Kiki Sol',
    briefing: [
      'Kiki: Kiki is the informant tonight. Cangrejo bought a hit at Playa Ceniza.',
      'Get to the beach, keep her alive through the shootout, and use the shotgun if you have to.',
    ],
    reward: { cash: 11000, rep: 1600, unlockWeapon: 'shotgun' },
    barks: {
      start: 'Kiki: They are already setting up by the parasols!',
      stagePass: 'Kiki: I am fine. Keep the barrels pointed that way!',
      fail: 'Kiki: No! We have to pull out and try this again.',
      complete: 'Kiki: You saved my life. I am putting you on the big jobs.',
    },
    stages: [
      {
        objective: 'Reach Kiki at Playa Ceniza',
        nextHint: 'HOLD THE BEACH',
        type: 'reach', target: { x: -270, z: -36 }, radius: 13, timer: 0,
        fail: 'Wasted or busted before reaching Kiki.',
      },
      {
        objective: 'Hold off the Cangrejo gunmen for forty seconds',
        nextHint: 'GET KIKI TO THE VAN',
        type: 'survive', target: { count: 4, x: -270, z: -36, spread: 12, label: 'Cangrejo gunman' },
        radius: 0, timer: 40, fail: 'Wasted, busted, or Kiki is hit.',
      },
      {
        objective: 'Walk Kiki to the waiting van',
        nextHint: 'COLLECT YOUR PAY',
        type: 'reach', target: { x: -312, z: -38 }, radius: 11, timer: 0,
        fail: 'Wasted, busted, or Kiki is hit.',
      },
    ],
  },
  {
    id: 'corona-tower-job', number: 6, title: 'CORONA TOWER JOB', giver: 'Mira Kesang',
    briefing: [
      'Mira: The tower roof has a view of every fiscal in the city. So does the PMPD now.',
      'Get in, get a car, and survive a four-star cordon with the helicopter on your tail.',
    ],
    reward: { cash: 15000, rep: 2200, unlockWeapon: 'smg' },
    barks: {
      start: 'Mira: Four stars, Rafa. Bring a car with teeth.',
      stagePass: 'Mira: They cannot see you. Keep it that way.',
      fail: 'Mira: The tower is crawling. We go again.',
      complete: 'Mira: Four stars and still breathing. That is a career.',
    },
    stages: [
      {
        objective: 'Reach the Corona tower',
        nextHint: 'FIND A CAR ON THE AVENUE',
        type: 'reach', target: { x: 28, z: 194 }, radius: 15, timer: 0,
        fail: 'Wasted or busted.',
      },
      {
        objective: 'Take a car from the tower avenue',
        nextHint: 'BREAK THE CORONA CORDON',
        type: 'steal', target: { x: 28, z: 194 }, allowAny: true,
        radius: 18, timer: 0, fail: 'Wasted, busted, or the car is destroyed.',
      },
      {
        objective: 'Escape the Corona cordon',
        nextHint: 'GET BACK TO THE GARAGE',
        type: 'escape', target: { minStars: 4 }, forceWanted: 4,
        radius: 0, timer: 135, fail: 'Busted, or the four-star response never breaks.',
      },
      {
        objective: 'Return to Tavo’s garage',
        nextHint: 'COLLECT YOUR PAY',
        type: 'reach', target: { x: 24, z: 78 }, requiresVehicle: true,
        radius: 13, timer: 0, fail: 'Wasted or busted.',
      },
    ],
  },
  {
    id: 'cerro-verde-ambush', number: 7, title: 'CERRO VERDE AMBUSH', giver: 'Mira Kesang',
    briefing: [
      'Mira: The rival boss is taking the winding road up to Cerro Verde with two escorts.',
      'Meet him on the hill and put him off the road. Then get back down before the PMPD arrives.',
    ],
    reward: { cash: 19000, rep: 3000, unlockWeapon: 'rifle' },
    barks: {
      start: 'Mira: He is on the hill. Do not let him pass you.',
      stagePass: 'Mira: Boss is down. Finish the run.',
      fail: 'Mira: He slipped the trap. We will set another.',
      complete: 'Mira: The hill belongs to us now.',
    },
    stages: [
      {
        objective: 'Drive up to Cerro Verde',
        nextHint: 'FIND THE RIVAL BOSS',
        type: 'reach', target: { x: 240, z: 284 }, radius: 18, timer: 0,
        fail: 'Wasted or busted.',
      },
      {
        objective: 'Take out the rival boss on the hill road',
        nextHint: 'GET BACK TO THE DOCKS',
        type: 'kill', target: { count: 1, x: 240, z: 284, spread: 6, label: 'rival boss' },
        radius: 0, timer: 0, fail: 'Wasted, busted, or the boss escapes.',
      },
      {
        objective: 'Get off the hill and reach the docks',
        nextHint: 'COLLECT YOUR PAY',
        type: 'reach', target: { x: 180, z: 108 }, requiresVehicle: true,
        radius: 15, timer: 90, fail: 'Wasted, busted, or time runs out.',
      },
    ],
  },
  {
    id: 'marea-roja', number: 8, title: 'MAREA ROJA', giver: 'Mira Kesang',
    briefing: [
      'Mira: El Pulpo is closing the causeway deal. His ledger ends every favor the Cangrejo owns.',
      'Take the ledger, survive five stars, and bring it to me. After tonight we call the shots.',
    ],
    reward: { cash: 30000, rep: 5000, unlockWeapon: 'grenade' },
    barks: {
      start: 'Mira: Last job, Rafa. Make them remember the name.',
      stagePass: 'Mira: He cannot get away now.',
      fail: 'Mira: The ledger is lost. We will take the causeway again.',
      complete: 'Mira: Marea Roja. Our city. Nobody takes it back.',
    },
    stages: [
      {
        objective: 'Reach El Pulpo on the causeway',
        nextHint: 'TAKE THE LEDGER',
        type: 'reach', target: { x: -330, z: -46 }, radius: 16, timer: 0,
        fail: 'Wasted or busted.',
      },
      {
        objective: 'Take El Pulpo out and claim the ledger',
        nextHint: 'SURVIVE THE FIVE-STAR RESPONSE',
        type: 'kill', target: { count: 1, x: -330, z: -46, spread: 5, label: 'El Pulpo' },
        radius: 0, timer: 0, fail: 'Wasted, busted, or El Pulpo escapes.',
      },
      {
        objective: 'Escape the five-star response',
        nextHint: 'BRING THE LEDGER TO MIRA',
        type: 'escape', target: { minStars: 5 }, forceWanted: 5,
        radius: 0, timer: 160, fail: 'Busted, or the five-star response never breaks.',
      },
      {
        objective: 'Deliver the ledger to Mira at the garage',
        nextHint: 'FINISH THE CAMPAIGN',
        type: 'reach', target: { x: 24, z: 78 }, requiresVehicle: true,
        radius: 14, timer: 0, fail: 'Wasted or busted before the handover.',
      },
    ],
  },
];

export const SIDE_JOBS = [
  {
    id: 'side-lowrider', giver: 'Kiki Sol', title: 'LOW RIDER WANTED',
    description: 'Kiki wants a Cangrejo lowrider parked outside the night market.',
    vehicleType: 'lowrider', near: { x: -190, z: 70 },
    reward: { cash: 1400, rep: 150 },
  },
  {
    id: 'side-wasp', giver: 'Kiki Sol', title: 'THE LITTLE WASP',
    description: 'Bring Kiki an Avispa scooter from the Malecón waterfront.',
    vehicleType: 'scooter', near: { x: -8, z: -27 },
    reward: { cash: 900, rep: 100 },
  },
  {
    id: 'side-marisma', giver: 'Kiki Sol', title: 'MARISMA RUN',
    description: 'A plain Marisma van, no questions asked. Try the docks.',
    vehicleType: 'van', near: { x: 178, z: 98 },
    reward: { cash: 1800, rep: 200 },
  },
];

export function jobById(id) {
  return JOBS.find((job) => job.id === id) ?? null;
}

export function jobByNumber(number) {
  return JOBS.find((job) => job.number === number) ?? JOBS[0];
}

export function jobTitle(job) {
  return job ? `JOB ${String(job.number).padStart(2, '0')} · ${job.title}` : 'FREE ROAM';
}
