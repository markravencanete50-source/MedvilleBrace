/*
  Recovery guides. Original writing for Medville Brace, in plain English:
  short sentences, no contractions, no promises about outcomes. Each guide
  ends by sending the reader back to their own clinician for decisions.
*/
export type GuideSection = { heading: string; paragraphs: string[]; list?: string[] };
export type Guide = {
  slug: string;
  title: string;
  description: string;
  photo: string;
  region: string;
  category?: string;
  minutes: number;
  updated: string;
  sections: GuideSection[];
};

export const GUIDES: Guide[] = [
  {
    slug: "measure-for-a-knee-brace",
    title: "How to measure for a knee brace",
    description: "A soft tape, two measurements and five minutes. How to size a knee sleeve or hinged brace so it stays put and does not pinch.",
    photo: "physio-leg",
    region: "knee",
    category: "hinged-knee-brace",
    minutes: 5,
    updated: "2026-10-09",
    sections: [
      {
        heading: "Why the size matters more than the model",
        paragraphs: [
          "A knee brace only works if the hinge sits level with the joint. A brace that is too big slides down as you walk, and the hinge ends up below the knee. A brace that is too small digs in above and below the knee and can cut off comfort quickly.",
          "Most knee braces are sized from the circumference of the leg, not from your height or weight. That is good news, because a tape measure gives a reliable answer.",
        ],
      },
      {
        heading: "What you need",
        paragraphs: ["A soft tape measure, a pen, and a chair. If you only have a hard tape, use a piece of string and measure the string afterwards."],
      },
      {
        heading: "Taking the measurements",
        paragraphs: ["Stand with your weight on both legs and the knee slightly bent. Measure bare skin, not over clothing."],
        list: [
          "Find the middle of the kneecap.",
          "Measure around the thigh 6 inches above that point.",
          "Measure around the calf 6 inches below that point.",
          "Write both numbers down, in inches.",
          "If the product page asks for a third number, it is usually around the middle of the kneecap itself.",
        ],
      },
      {
        heading: "Reading a size chart",
        paragraphs: [
          "Each product page lists the sizing method from the manufacturer. Some charts use only the thigh. Some use thigh and calf together. If your two numbers fall in different sizes, choose the size that matches the thigh, unless the chart says otherwise.",
          "If you are between two sizes, choose the smaller one for a sleeve and the larger one for a hinged brace with adjustable straps.",
        ],
      },
      {
        heading: "After a surgery",
        paragraphs: [
          "Swelling changes your measurements in the first weeks. A post-op brace with adjustable straps and a universal size is common for that reason. Follow the size and range-of-motion settings your surgical team gives you.",
        ],
      },
    ],
  },
  {
    slug: "tall-or-short-walker-boot",
    title: "Tall or short walker boot: how they differ",
    description: "Tall walker boots hold more of the lower leg. Short boots are lighter and easier to walk in. What each one is usually chosen for.",
    photo: "region-foot-ankle",
    region: "foot-ankle",
    category: "walker-boot",
    minutes: 4,
    updated: "2026-10-09",
    sections: [
      {
        heading: "What a walker boot does",
        paragraphs: [
          "A walker boot holds the foot and ankle in a steady position while still letting you stand and walk. A rocker sole rolls you from heel to toe, so the ankle does not have to bend as much.",
        ],
      },
      {
        heading: "Tall boots",
        paragraphs: [
          "A tall boot reaches up to just below the knee. The long uprights hold the ankle and the lower leg together, which limits more movement.",
          "Tall boots are often chosen for fractures of the ankle and lower leg, for Achilles tendon injuries, and after ankle surgery.",
        ],
      },
      {
        heading: "Short boots",
        paragraphs: [
          "A short boot stops a little above the ankle. It is lighter and easier to fit under trousers.",
          "Short boots are often chosen for injuries of the foot and toes, stable foot fractures and sprains that need less control.",
        ],
      },
      {
        heading: "Air cells and liners",
        paragraphs: [
          "Some boots have air cells you can inflate with a built-in pump. The air fills the space around the leg and gives a closer fit as swelling goes up and down through the day.",
          "Liners wear out. Replacement liners and straps are listed under Parts and Accessories, so you do not need a new boot when only the soft parts are tired.",
        ],
      },
      {
        heading: "Walking evenly",
        paragraphs: [
          "A boot makes one leg taller than the other. Many people feel it in the hip or back after a few days. A shoe leveler on the other foot evens the height and is worth asking about if you will wear the boot for weeks.",
        ],
      },
    ],
  },
  {
    slug: "lso-or-tlso-back-brace",
    title: "LSO or TLSO: choosing a back brace",
    description: "The letters describe how much of the spine a brace covers. A plain guide to lumbar supports, LSO braces and TLSO braces.",
    photo: "region-back-hip",
    region: "back-hip",
    category: "back-brace",
    minutes: 5,
    updated: "2026-10-09",
    sections: [
      {
        heading: "What the letters mean",
        paragraphs: ["Back braces are named for the parts of the spine they cover."],
        list: [
          "L is lumbar: the lower back.",
          "S is sacral: the base of the spine, where it meets the pelvis.",
          "T is thoracic: the middle back, behind the ribs.",
          "O is orthosis: a device that supports or corrects.",
        ],
      },
      {
        heading: "Soft lumbar supports",
        paragraphs: [
          "A soft support wraps the lower back with elastic and a few flexible stays. It gives warmth and a reminder to lift with care. It does not hold the spine still. Many people use one for strain at work or during a flare of back pain.",
        ],
      },
      {
        heading: "LSO braces",
        paragraphs: [
          "An LSO adds rigid or semi-rigid panels at the back, and often at the front. Pulleys or straps tighten the brace evenly. LSO braces limit bending and twisting of the lower back. They are common after lower back surgery and for disc and stenosis problems.",
          "Many LSO systems are modular. Panels can be added or removed as recovery moves along, so one frame can serve several stages.",
        ],
      },
      {
        heading: "TLSO braces",
        paragraphs: [
          "A TLSO extends up the back to the shoulder blades and sometimes has a chest plate. It controls movement through the middle back as well. TLSO braces are most often prescribed after a fracture or surgery in the thoracic spine.",
          "A TLSO should be fitted by your care team. Wearing one without guidance can cause pressure sores or slow healing.",
        ],
      },
      {
        heading: "Billing codes",
        paragraphs: [
          "Many braces list an L-code, such as L0631 or L0457. These are the codes insurers use. A code on a product page tells you how a device is usually billed. It does not mean your plan will cover it. Ask your insurer before you order if coverage matters to you.",
        ],
      },
    ],
  },
  {
    slug: "cold-therapy-at-home",
    title: "Using cold therapy at home safely",
    description: "How circulating cold therapy units work, how long to use them, and the simple checks that protect your skin.",
    photo: "region-therapy",
    region: "therapy",
    category: "cold-therapy",
    minutes: 4,
    updated: "2026-10-09",
    sections: [
      {
        heading: "How a cold therapy unit works",
        paragraphs: [
          "A cold therapy unit is a cooler with a small pump. You fill it with ice and water. The pump moves the cold water through a pad that wraps the joint, then back to the cooler. The pad stays cold for hours instead of minutes, and you do not need to swap ice packs.",
          "Some units add compression, which gently squeezes the pad on and off to help move swelling.",
        ],
      },
      {
        heading: "How long to use it",
        paragraphs: [
          "Follow the schedule your surgeon or therapist gives you. A common pattern is 20 to 30 minutes on, then at least the same time off. Do not sleep with a unit running unless your care team has told you that it is safe for your device.",
        ],
      },
      {
        heading: "Protect your skin",
        list: [
          "Always keep a thin barrier, such as a cloth or the pad's own cover, between the pad and your skin.",
          "Check the skin every session. Stop if it looks white, blotchy or feels numb.",
          "Take extra care if you have diabetes, poor circulation or reduced feeling in the area.",
          "Keep dressings dry. Most pads can sit over a dressing, but water must not reach the wound.",
        ],
        paragraphs: [],
      },
      {
        heading: "Pads and spares",
        paragraphs: [
          "Pads are shaped for each joint. A knee pad will not fit a shoulder well. Many units take pads for several joints, so check the pad list on the product page before you order a spare. Tubing and power cords are sold separately when they wear out.",
        ],
      },
    ],
  },
  {
    slug: "night-splints-for-heel-pain",
    title: "Night splints for heel pain in the morning",
    description: "Why the first steps of the day hurt with plantar fasciitis, and how a night splint keeps the foot in a gentle stretch while you sleep.",
    photo: "resistance-band",
    region: "foot-ankle",
    category: "night-splint",
    minutes: 4,
    updated: "2026-10-09",
    sections: [
      {
        heading: "Why mornings are the worst",
        paragraphs: [
          "The plantar fascia is a thick band under the foot. At night the foot relaxes and points down, so the band tightens. The first steps in the morning stretch it again all at once, which is why heel pain often peaks then.",
        ],
      },
      {
        heading: "What a night splint does",
        paragraphs: [
          "A night splint holds the foot at a gentle angle, with the toes drawn up a little, while you sleep. The band stays at a comfortable length through the night instead of tightening.",
        ],
      },
      {
        heading: "Boot or dorsal style",
        paragraphs: [
          "Boot-style splints wrap the back of the leg and the sole. They are firm and hold the angle well. Dorsal splints sit on the top of the foot and the front of the shin, so the heel and sole are free. Many people find a dorsal splint cooler and easier to sleep in.",
        ],
      },
      {
        heading: "Getting used to it",
        list: [
          "Start with an hour or two in the evening before you wear it all night.",
          "Set a gentle angle first. You can increase it over several nights.",
          "If your foot tingles or goes numb, loosen the straps.",
        ],
        paragraphs: [],
      },
      {
        heading: "When to see someone",
        paragraphs: [
          "Heel pain that does not ease after several weeks, pain with swelling or redness, or pain after a fall should be checked by a clinician.",
        ],
      },
    ],
  },
  {
    slug: "first-weeks-with-an-afo",
    title: "Your first weeks with an ankle-foot orthosis",
    description: "Shoes, socks, wearing time and skin checks for people starting an AFO for foot drop.",
    photo: "fitting-afo",
    region: "foot-ankle",
    category: "afo",
    minutes: 5,
    updated: "2026-10-09",
    sections: [
      {
        heading: "What an AFO is for",
        paragraphs: [
          "An ankle-foot orthosis, or AFO, holds the front of the foot up as you step. People with foot drop, which can follow a stroke, nerve injury or other conditions, use one so the toes clear the floor and they trip less.",
          "Carbon fiber AFOs are light and springy. Plastic AFOs are firmer. Your clinician will suggest the style that suits how much support you need.",
        ],
      },
      {
        heading: "Shoes and socks",
        list: [
          "Wear a thin, seamless sock that is taller than the AFO.",
          "Choose a shoe with a removable insole and a wide opening. The AFO takes up space, so you may need a half size larger.",
          "Lace-up or strap shoes hold the foot against the AFO better than slip-ons.",
        ],
        paragraphs: [],
      },
      {
        heading: "Building up wearing time",
        paragraphs: [
          "Start with an hour or two a day, then add an hour each day as your skin and muscles adjust. Most people reach full days within one to two weeks.",
        ],
      },
      {
        heading: "Daily skin checks",
        paragraphs: [
          "After you take the AFO off, look at the skin where it touched you. Light pink marks that fade within 20 minutes are normal. Marks that stay red, blisters or broken skin mean the AFO needs adjusting. Stop wearing it and contact the person who fitted it.",
        ],
      },
      {
        heading: "Care and spare parts",
        paragraphs: [
          "Wipe the AFO with a damp cloth. Keep it away from heaters and car dashboards, which can warp plastic. Replacement pads and straps for many AFOs are listed under Parts and Accessories.",
        ],
      },
    ],
  },
];

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);
