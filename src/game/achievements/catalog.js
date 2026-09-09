// Ported from the accepted Haven catalog. Requirements follow Brackenwake's live rules.
export const ACHIEVEMENTS = Object.freeze([
  {
    "id": "finding-your-feet",
    "number": 1,
    "name": "Finding your feet",
    "title": "The newcomer",
    "category": "progression",
    "description": "Reach 50 in any skill.",
    "requirements": [
      {
        "metric": "skillMax",
        "target": 50
      }
    ],
    "reward": null
  },
  {
    "id": "a-practiced-hand",
    "number": 2,
    "name": "A practiced hand",
    "title": "The adept",
    "category": "progression",
    "description": "Reach 100 in any skill.",
    "requirements": [
      {
        "metric": "skillMax",
        "target": 100
      }
    ],
    "reward": null
  },
  {
    "id": "several-strings-to-your-bow",
    "number": 3,
    "name": "Several strings to your bow",
    "title": "The versatile",
    "category": "progression",
    "description": "Reach 50 in three different skills.",
    "requirements": [
      {
        "metric": "skillsAt50",
        "target": 3
      }
    ],
    "reward": null
  },
  {
    "id": "island-experience",
    "number": 4,
    "name": "Island experience",
    "title": "The seasoned",
    "category": "progression",
    "description": "Earn 500 total skill points.",
    "requirements": [
      {
        "metric": "skillTotal",
        "target": 500
      }
    ],
    "reward": null
  },
  {
    "id": "first-blood",
    "number": 5,
    "name": "First blood",
    "title": "The blooded",
    "category": "combat",
    "description": "Defeat your first hostile creature.",
    "requirements": [
      {
        "metric": "kills",
        "target": 1
      }
    ],
    "reward": null
  },
  {
    "id": "a-sticky-situation",
    "number": 6,
    "name": "Trouble underfoot",
    "title": "The rat catcher",
    "category": "combat",
    "description": "Defeat 25 giant rats.",
    "requirements": [
      {
        "metric": "ratKills",
        "target": 25
      }
    ],
    "reward": null
  },
  {
    "id": "holding-haven",
    "number": 7,
    "name": "Holding Haven",
    "title": "The defender of Haven",
    "category": "combat",
    "description": "Defeat 100 hostile creatures.",
    "requirements": [
      {
        "metric": "kills",
        "target": 100
      }
    ],
    "reward": {
      "kind": "constitution",
      "amount": 1,
      "name": "Hardiness",
      "description": "+1 Constitution, giving 2 additional maximum health."
    }
  },
  {
    "id": "close-quarters",
    "number": 8,
    "name": "Close quarters",
    "title": "The skirmisher",
    "category": "combat",
    "description": "Defeat 25 hostile creatures with melee weapons.",
    "requirements": [
      {
        "metric": "meleeKills",
        "target": 25
      }
    ],
    "reward": null
  },
  {
    "id": "a-steady-hand",
    "number": 9,
    "name": "A steady hand",
    "title": "The marksman",
    "category": "combat",
    "description": "Defeat 25 hostile creatures with a bow.",
    "requirements": [
      {
        "metric": "rangedKills",
        "target": 25
      }
    ],
    "reward": null
  },
  {
    "id": "stand-firm",
    "number": 10,
    "name": "Stand firm",
    "title": "The stalwart",
    "category": "combat",
    "description": "Successfully block 25 enemy attacks.",
    "requirements": [
      {
        "metric": "blocks",
        "target": 25
      }
    ],
    "reward": null
  },
  {
    "id": "without-a-scratch",
    "number": 11,
    "name": "Without a scratch",
    "title": "The untouched",
    "category": "combat",
    "description": "Defeat a hostile creature from full health without taking damage during the fight.",
    "requirements": [
      {
        "metric": "cleanKill",
        "target": 1
      }
    ],
    "reward": null
  },
  {
    "id": "trust-your-own-steel",
    "number": 12,
    "name": "Trust your own steel",
    "title": "The resourceful",
    "category": "combat",
    "description": "Defeat 10 hostile creatures using weapons you crafted.",
    "requirements": [
      {
        "metric": "craftedKills",
        "target": 10
      }
    ],
    "reward": null
  },
  {
    "id": "timber-for-tomorrow",
    "number": 13,
    "name": "Timber for tomorrow",
    "title": "The woodcutter",
    "category": "gathering",
    "description": "Personally gather 100 wood.",
    "requirements": [
      {
        "metric": "wood",
        "target": 100
      }
    ],
    "reward": null
  },
  {
    "id": "beneath-the-surface",
    "number": 14,
    "name": "Beneath the surface",
    "title": "The miner",
    "category": "gathering",
    "description": "Personally gather 100 stone or ore.",
    "requirements": [
      {
        "metric": "mining",
        "target": 100
      }
    ],
    "reward": null
  },
  {
    "id": "a-useful-basket",
    "number": 15,
    "name": "A useful basket",
    "title": "The forager",
    "category": "gathering",
    "description": "Gather five different forage resources.",
    "requirements": [
      {
        "metric": "forageKinds",
        "target": 5
      }
    ],
    "reward": null
  },
  {
    "id": "knowing-your-herbs",
    "number": 16,
    "name": "Knowing your herbs",
    "title": "The herbalist",
    "category": "gathering",
    "description": "Personally gather 50 dandelions.",
    "requirements": [
      {
        "metric": "herbs",
        "target": 50
      }
    ],
    "reward": null
  },
  {
    "id": "something-on-the-line",
    "number": 17,
    "name": "What the wild leaves",
    "title": "The skinner",
    "category": "gathering",
    "description": "Successfully skin 25 creatures.",
    "requirements": [
      {
        "metric": "skinned",
        "target": 25
      }
    ],
    "reward": null
  },
  {
    "id": "tools-of-your-own",
    "number": 18,
    "name": "Tools of your own",
    "title": "The provider",
    "category": "gathering",
    "description": "Gather 25 wood with your crafted axe and 25 stone or ore with your crafted pickaxe.",
    "requirements": [
      {
        "metric": "ownAxeWood",
        "target": 25
      },
      {
        "metric": "ownPickMining",
        "target": 25
      }
    ],
    "reward": {
      "kind": "capacity",
      "amount": 10,
      "name": "Prepared pack",
      "description": "+10 carrying capacity."
    }
  },
  {
    "id": "reading-the-ground",
    "number": 19,
    "name": "Know your quarry",
    "title": "The tracker",
    "category": "gathering",
    "description": "Mark three different creature species.",
    "requirements": [
      {
        "metric": "markedSpecies",
        "target": 3
      }
    ],
    "reward": null
  },
  {
    "id": "earning-its-trust",
    "number": 20,
    "name": "A little company",
    "title": "The caller",
    "category": "gathering",
    "description": "Successfully summon an ally.",
    "requirements": [
      {
        "metric": "summons",
        "target": 1
      }
    ],
    "reward": null
  },
  {
    "id": "made-by-hand",
    "number": 21,
    "name": "Made by hand",
    "title": "The maker",
    "category": "crafting",
    "description": "Craft your first tool, weapon, or armor piece.",
    "requirements": [
      {
        "metric": "equipmentCrafts",
        "target": 1
      }
    ],
    "reward": null
  },
  {
    "id": "learning-the-recipes",
    "number": 22,
    "name": "Learning the recipes",
    "title": "The artisan",
    "category": "crafting",
    "description": "Complete 10 different crafting recipes.",
    "requirements": [
      {
        "metric": "recipes",
        "target": 10
      }
    ],
    "reward": {
      "kind": "quality",
      "amount": 0.02,
      "name": "Careful workmanship",
      "description": "+0.02 quality on future crafts, up to the 1.30 quality cap."
    }
  },
  {
    "id": "ready-for-work",
    "number": 23,
    "name": "Ready for work",
    "title": "The toolmaker",
    "category": "crafting",
    "description": "Craft an axe and a pickaxe.",
    "requirements": [
      {
        "metric": "craftedAxe",
        "target": 1
      },
      {
        "metric": "craftedPickaxe",
        "target": 1
      }
    ],
    "reward": null
  },
  {
    "id": "hammer-and-heat",
    "number": 24,
    "name": "Hammer and heat",
    "title": "The smith",
    "category": "crafting",
    "description": "Complete 25 blacksmithing crafts across at least three recipes.",
    "requirements": [
      {
        "metric": "smithCrafts",
        "target": 25
      },
      {
        "metric": "smithRecipes",
        "target": 3
      }
    ],
    "reward": null
  },
  {
    "id": "string-and-feather",
    "number": 25,
    "name": "String and feather",
    "title": "The bowyer",
    "category": "crafting",
    "description": "Craft a bow and 48 arrows.",
    "requirements": [
      {
        "metric": "craftedBow",
        "target": 1
      },
      {
        "metric": "arrows",
        "target": 48
      }
    ],
    "reward": null
  },
  {
    "id": "cut-and-stitched",
    "number": 26,
    "name": "Cut and stitched",
    "title": "The leatherworker",
    "category": "crafting",
    "description": "Craft a leather outfit.",
    "requirements": [
      {
        "metric": "leatherOutfit",
        "target": 1
      }
    ],
    "reward": null
  },
  {
    "id": "enough-to-share",
    "number": 27,
    "name": "Enough to share",
    "title": "The camp cook",
    "category": "crafting",
    "description": "Prepare 25 servings of food.",
    "requirements": [
      {
        "metric": "food",
        "target": 25
      }
    ],
    "reward": null
  },
  {
    "id": "a-measured-mixture",
    "number": 28,
    "name": "A measured mixture",
    "title": "The alchemist",
    "category": "crafting",
    "description": "Craft 10 healing draughts.",
    "requirements": [
      {
        "metric": "tonics",
        "target": 10
      }
    ],
    "reward": null
  },
  {
    "id": "still-has-some-life",
    "number": 29,
    "name": "Care in the making",
    "title": "The craftsperson",
    "category": "crafting",
    "description": "Craft 10 exceptional equipment items.",
    "requirements": [
      {
        "metric": "exceptionalCrafts",
        "target": 10
      }
    ],
    "reward": {
      "kind": "quality",
      "amount": 0.01,
      "name": "A trained eye",
      "description": "+0.01 quality on future crafts, up to the 1.30 quality cap."
    }
  },
  {
    "id": "dressed-in-your-own-work",
    "number": 30,
    "name": "Dressed in your own work",
    "title": "The outfitter",
    "category": "crafting",
    "description": "Wear an outfit you personally crafted.",
    "requirements": [
      {
        "metric": "ownArmorEquipped",
        "target": 1
      }
    ],
    "reward": null
  },
  {
    "id": "something-worth-noticing",
    "number": 31,
    "name": "Something worth noticing",
    "title": "The curious",
    "category": "exploration",
    "description": "Discover your first point of interest.",
    "requirements": [
      {
        "metric": "discoveries",
        "target": 1
      }
    ],
    "reward": null
  },
  {
    "id": "getting-your-bearings",
    "number": 32,
    "name": "Getting your bearings",
    "title": "The wayfinder",
    "category": "exploration",
    "description": "Discover five different points of interest.",
    "requirements": [
      {
        "metric": "discoveries",
        "target": 5
      }
    ],
    "reward": null
  },
  {
    "id": "knowing-haven",
    "number": 33,
    "name": "Knowing Haven",
    "title": "The island explorer",
    "category": "exploration",
    "description": "Visit all 15 places on the island checklist.",
    "requirements": [
      {
        "metric": "landmarks",
        "target": 15
      }
    ],
    "reward": null
  },
  {
    "id": "the-long-way-round",
    "number": 34,
    "name": "The long way round",
    "title": "The rambler",
    "category": "exploration",
    "description": "Walk through 500 different outdoor map cells (4 metres across).",
    "requirements": [
      {
        "metric": "outdoorTiles",
        "target": 500
      }
    ],
    "reward": null
  },
  {
    "id": "after-sundown",
    "number": 35,
    "name": "After sundown",
    "title": "The night wanderer",
    "category": "exploration",
    "description": "Visit five different landmarks at night.",
    "requirements": [
      {
        "metric": "nightLandmarks",
        "target": 5
      }
    ],
    "reward": null
  },
  {
    "id": "a-little-warmth",
    "number": 36,
    "name": "A little warmth",
    "title": "The camper",
    "category": "community",
    "description": "Light a campfire with the Camp ability and become rested.",
    "requirements": [
      {
        "metric": "campfire",
        "target": 1
      }
    ],
    "reward": null
  },
  {
    "id": "a-roof-of-your-own",
    "number": 37,
    "name": "Below the island",
    "title": "The delver",
    "category": "community",
    "description": "Explore three different dungeon floors.",
    "requirements": [
      {
        "metric": "dungeonFloors",
        "target": 3
      }
    ],
    "reward": null
  },
  {
    "id": "putting-something-aside",
    "number": 38,
    "name": "Putting something aside",
    "title": "The quartermaster",
    "category": "community",
    "description": "Open 10 different dungeon chests.",
    "requirements": [
      {
        "metric": "chests",
        "target": 10
      }
    ],
    "reward": {
      "kind": "capacity",
      "amount": 10,
      "name": "Good packing",
      "description": "+10 carrying capacity."
    }
  },
  {
    "id": "a-fair-exchange",
    "number": 39,
    "name": "A fair exchange",
    "title": "The trader",
    "category": "community",
    "description": "Complete your first trade with another player.",
    "requirements": [
      {
        "metric": "trade",
        "target": 1
      }
    ],
    "reward": null
  },
  {
    "id": "a-place-in-haven",
    "number": 40,
    "name": "A place in Haven",
    "title": "Of Haven",
    "category": "community",
    "description": "Complete 25 other Haven achievements, including at least one from each category.",
    "requirements": [
      {
        "metric": "completed",
        "target": 25
      },
      {
        "metric": "categories",
        "target": 6
      }
    ],
    "reward": {
      "kind": "wisdom",
      "amount": 10,
      "name": "Island knowledge",
      "description": "+10 Wisdom and 10% higher skill-gain chance. Skill caps still apply."
    }
  }
].map(row => Object.freeze({...row, requirements: Object.freeze(row.requirements.map(Object.freeze)), reward: row.reward && Object.freeze(row.reward)})));
export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map(row => [row.id, row]));
export const METRIC_CAPS = Object.fromEntries(ACHIEVEMENTS.flatMap(row => row.requirements).map(({metric}) => [metric, Math.max(...ACHIEVEMENTS.flatMap(row => row.requirements).filter(r => r.metric === metric).map(r => r.target))]));
