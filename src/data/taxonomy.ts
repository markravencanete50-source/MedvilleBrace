/*
  How the catalog is organised for people, not for warehouses.

  Body regions are the first way in: most visitors know where it hurts before
  they know what a device is called. Categories and conditions come from the
  catalog itself (scripts/build-catalog.mjs); this file only adds the words
  and pictures a person sees.
*/
export type RegionSlug =
  | "knee"
  | "foot-ankle"
  | "back-hip"
  | "neck"
  | "shoulder"
  | "elbow"
  | "hand-wrist"
  | "therapy";

export type Region = {
  slug: RegionSlug;
  name: string;
  short: string;
  blurb: string;
  photo: string;
};

export const REGIONS: Region[] = [
  {
    slug: "knee",
    name: "Knee",
    short: "Sleeves, hinged braces, unloaders and post-op braces.",
    blurb:
      "From a light sleeve for a long walk to a range-of-motion brace after surgery. Knee devices differ most in how much they limit movement, so start with what your clinician has asked you to protect.",
    photo: "region-knee",
  },
  {
    slug: "foot-ankle",
    name: "Foot and Ankle",
    short: "Walker boots, stirrups, night splints and AFOs.",
    blurb:
      "Walker boots, ankle stirrups, night splints, post-op shoes and ankle-foot orthoses. Height matters here: a tall boot holds more of the lower leg than a short one.",
    photo: "region-foot-ankle",
  },
  {
    slug: "back-hip",
    name: "Back and Hip",
    short: "Lumbar supports, LSO and TLSO braces, SI belts.",
    blurb:
      "Lumbar supports, rigid LSO and TLSO braces, sacroiliac belts and hip orthoses. Rigid back braces are usually prescribed. Soft supports are common for everyday strain.",
    photo: "region-back-hip",
  },
  {
    slug: "neck",
    name: "Neck",
    short: "Cervical collars and home traction.",
    blurb:
      "Soft and rigid cervical collars, replacement pads and home traction devices. A rigid collar after an injury or surgery should be fitted by the team that prescribed it.",
    photo: "region-neck",
  },
  {
    slug: "shoulder",
    name: "Shoulder",
    short: "Arm slings, immobilizers and abduction braces.",
    blurb:
      "Arm slings, shoulder immobilizers and abduction braces for the weeks after an injury or a repair. Check which arm position your surgeon wants before you choose.",
    photo: "region-shoulder",
  },
  {
    slug: "elbow",
    name: "Elbow",
    short: "Counterforce straps, sleeves and hinged elbow braces.",
    blurb:
      "Counterforce straps for tennis and golfer's elbow, compression sleeves and hinged braces that control how far the elbow bends.",
    photo: "region-elbow",
  },
  {
    slug: "hand-wrist",
    name: "Hand and Wrist",
    short: "Wrist splints, thumb spicas and carpal tunnel braces.",
    blurb:
      "Wrist splints, thumb spica braces, carpal tunnel supports and wrist-hand orthoses. Most are made for one side, so order the hand you need.",
    photo: "region-hand-wrist",
  },
  {
    slug: "therapy",
    name: "Cold and Recovery",
    short: "Cold therapy units, pads, TENS and mobility aids.",
    blurb:
      "Circulating cold therapy units, replacement pads, hot and cold machines, TENS and EMS units, and simple mobility aids for the first weeks at home.",
    photo: "region-therapy",
  },
];

export const regionBySlug = (slug: string) => REGIONS.find((r) => r.slug === slug);

/* Short plain-English notes shown at the top of a category page. */
export const CATEGORY_NOTES: Record<string, string> = {
  "walker-boot": "A walker boot holds the foot and ankle so you can walk while a fracture, sprain or repair heals. Tall boots reach mid-calf. Short boots stop just above the ankle.",
  "post-op-shoe": "A post-op shoe has a stiff, flat sole and room for a dressing. It protects the forefoot after surgery or an injury.",
  "night-splint": "A night splint keeps the foot gently flexed while you sleep, which can ease the first painful steps in the morning.",
  afo: "An ankle-foot orthosis lifts the front of the foot for people with foot drop, so the toes clear the ground when they walk.",
  "ankle-brace": "Ankle braces and stirrups limit rolling of the ankle while still letting it move forward and back.",
  "hinged-knee-brace": "Hinged and range-of-motion knee braces have side bars that control how far the knee can bend and straighten.",
  "unloader-brace": "An unloader brace shifts some load away from the worn side of the knee, often for osteoarthritis on one side.",
  "knee-support": "Soft knee supports give light compression and warmth for everyday aches and activity.",
  "patellar-strap": "A patellar strap presses gently below the kneecap to ease tendon strain.",
  "back-brace": "Lumbar supports and LSO braces wrap the lower back. Rigid panels limit motion. Soft ones remind you to move with care.",
  "hip-brace": "Hip braces control how far the hip can move, most often after a hip replacement or repair.",
  tlso: "A TLSO supports the middle and lower spine and is usually prescribed after a fracture or surgery.",
  "si-belt": "A sacroiliac belt wraps low around the pelvis to steady the joints between the spine and the hips.",
  "abdominal-binder": "Abdominal binders and support belts give even compression around the belly after surgery or during pregnancy.",
  "cervical-collar": "Cervical collars range from soft foam to rigid shells with replaceable pads.",
  "traction-device": "Home traction devices gently stretch the neck. Use one only as your clinician has shown you.",
  "arm-sling": "Slings and shoulder immobilizers rest the arm close to the body while the shoulder heals.",
  "shoulder-brace": "Shoulder braces support the joint during return to activity.",
  "elbow-brace": "Elbow braces and sleeves support the joint and the forearm muscles.",
  "counterforce-strap": "A counterforce strap sits just below the elbow to ease strain on the tendons.",
  "wrist-brace": "Wrist braces keep the wrist in a steady, neutral position, often for carpal tunnel or a sprain.",
  "thumb-spica": "A thumb spica holds the thumb and wrist together to rest the base of the thumb.",
  splint: "Splints hold a joint still so it can rest.",
  immobilizer: "Immobilizers keep a joint straight and still, often right after an injury or surgery.",
  "compression-sleeve": "Compression sleeves give light, even support and warmth.",
  "cold-therapy": "Cold therapy reduces swelling and eases pain after injury or surgery.",
  "hot-cold-therapy": "These units can deliver both heat and cold from one machine.",
  "tens-ems": "TENS units send gentle electrical pulses through pads to ease pain. EMS units work the muscles.",
  "mobility-aid": "Canes, scooters and other aids that make the first weeks easier.",
  insole: "Heel cups and insoles cushion and support the foot inside your own shoes.",
  wrap: "Wraps give adjustable compression where you need it.",
  "parts-accessories": "Replacement liners, straps, pads and parts. Check that a part matches your device before you order.",
};
