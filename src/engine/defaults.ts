import { PROJECT_FILE_VERSION, type ProjectConfig } from './types'

/** Projeto de exemplo exibido na primeira visita. */
export function createDefaultConfig(): ProjectConfig {
  return {
    version: PROJECT_FILE_VERSION,
    top: {
      length: 1200,
      width: 800,
      thickness: 6,
      holes: {
        enabled: true,
        diameter: 16,
        pitchX: 50,
        pitchY: 50,
        mode: 'auto',
        minMargin: 25,
        startX: 25,
        startY: 25,
      },
    },
    sides: {
      enabled: false,
      arrangement: 'all',
      height: 120,
      thickness: 6,
      setback: 5,
      slotIntoTop: true,
      holes: {
        enabled: false,
        diameter: 16,
        pitchX: 50,
        pitchY: 50,
        margin: 35,
      },
    },
    ribs: {
      enabled: false,
      layout: 'grid',
      height: 100,
      thickness: 6,
      countLongitudinal: 2,
      countTransverse: 3,
      endSetback: 20,
      alignBetweenHoles: true,
      interlock: true,
      slotIntoTop: true,
      slotIntoSides: false,
    },
    joints: {
      clearance: 0.5,
      tabWidth: 40,
      tabSpacing: 250,
      tabEndDistance: 60,
      minWeb: 3,
    },
    quote: {
      material: '',
      notes: '',
    },
    accessories: [],
  }
}
