/*
  Policy pages. Original text written for how this store actually works:
  a visitor sends an order request, the team confirms stock, size and the
  final total, and only then takes payment. Nothing here is legal advice;
  the owner should have these reviewed before launch. Figures come from
  COMPANY in site.ts so a change happens in one place.
*/
import { COMPANY } from "./site";

export type PolicySection = { heading: string; paragraphs: string[]; list?: string[] };
export type Policy = { slug: string; title: string; description: string; sections: PolicySection[] };

const free = `$${COMPANY.freeShippingFrom}`;

export const POLICIES: Policy[] = [
  {
    slug: "how-ordering-works",
    title: "How ordering works",
    description: "Send a request, we confirm size, stock and the total, then you pay. No card details are taken on this site.",
    sections: [
      {
        heading: "Why we confirm before we charge",
        paragraphs: [
          "Braces are sized to your body, and many are made for one side. A wrong size is the most common reason for a return. So every order starts as a request. A person on our team reads it, checks the size against the manufacturer's chart and confirms that the item is in stock.",
        ],
      },
      {
        heading: "The steps",
        paragraphs: [],
        list: [
          "Add products to your cart and choose the size and side for each one.",
          "Send the order request with your contact and delivery details.",
          "We reply within one business day with the confirmed items, the shipping cost and the final total.",
          "You approve the total and pay through the secure link in our reply.",
          "We ship and send you tracking.",
        ],
      },
      {
        heading: "No payment on this website",
        paragraphs: [
          "This website never asks for card details. If anyone asks you to send card numbers by email or text in our name, do not reply, and let us know.",
        ],
      },
    ],
  },
  {
    slug: "shipping",
    title: "Shipping",
    description: `Delivery across the ${COMPANY.country}. Standard shipping is free on confirmed orders over ${free}.`,
    sections: [
      {
        heading: "Where we ship",
        paragraphs: [`We ship to addresses in the ${COMPANY.country}, including PO boxes for most small items. Large items such as walker boots, back braces and cold therapy units need a street address.`],
      },
      {
        heading: "Cost",
        paragraphs: [
          `Standard shipping is free when the confirmed order total is ${free} or more. Below that, the shipping cost is shown in our confirmation before you pay. Faster delivery is available for most items and is quoted on request.`,
        ],
      },
      {
        heading: "When it ships",
        paragraphs: [
          "Most in-stock items leave our partner warehouses within one to two business days after payment. Some devices ship directly from the manufacturer and can take longer. If an item will take more than five business days, we tell you before you pay.",
        ],
      },
      {
        heading: "Tracking and damage",
        paragraphs: [
          "Every order ships with tracking. If a parcel arrives damaged, take a photo of the box and the item and contact us within seven days. We will arrange a replacement.",
        ],
      },
    ],
  },
  {
    slug: "returns",
    title: "Returns and exchanges",
    description: `Unused items in original packaging can be returned within ${COMPANY.returnDays} days. Size exchanges are the fastest fix.`,
    sections: [
      {
        heading: "What can be returned",
        paragraphs: [`You can return an item within ${COMPANY.returnDays} days of delivery when it is unused, clean and in its original packaging with all parts and tags.`],
      },
      {
        heading: "What cannot be returned",
        paragraphs: ["For hygiene and safety reasons we cannot accept these back once they have been opened or worn:"],
        list: [
          "Items that have been worn against the skin, including sleeves, liners and pads.",
          "Cold therapy pads and tubing that have held water.",
          "TENS and EMS electrodes.",
          "Items marked as final sale or renewed, unless they arrive faulty.",
        ],
      },
      {
        heading: "Wrong size",
        paragraphs: [
          "If the size is wrong and the item has only been tried on briefly over clothing, contact us before you send it back. In most cases we can exchange it for another size and cover the cost of the second shipment.",
        ],
      },
      {
        heading: "How refunds work",
        paragraphs: [
          "Contact us first so we can send return instructions. Once the item reaches us and is checked, the refund goes back to the original payment method within five business days. Shipping costs are refunded only when the item was faulty or we sent the wrong thing.",
        ],
      },
    ],
  },
  {
    slug: "warranty",
    title: "Warranty",
    description: "Every device carries the manufacturer's warranty. We help you make a claim.",
    sections: [
      {
        heading: "Manufacturer warranties",
        paragraphs: [
          "Each product is covered by its manufacturer's warranty against defects in materials and workmanship. The length depends on the brand and the device. Rigid braces and electronic units usually carry longer cover than soft goods.",
        ],
      },
      {
        heading: "What is not covered",
        list: ["Normal wear of straps, liners and padding.", "Damage from heat, misuse or changes made to the device.", "Items used by someone other than the original buyer."],
        paragraphs: [],
      },
      {
        heading: "Making a claim",
        paragraphs: [
          "Email us your order details, a short description of the fault and a photo. We contact the manufacturer for you and tell you the next step, which is usually a repair, a replacement part or a replacement device.",
        ],
      },
    ],
  },
  {
    slug: "insurance",
    title: "Insurance information",
    description: "Billing codes, receipts for your own claim, and what to ask your insurer before you order.",
    sections: [
      {
        heading: "We do not bill insurance directly",
        paragraphs: [
          "At this time Medville Brace does not bill Medicare, Medicaid or private insurers. You pay us directly. On request we can send an itemized receipt that lists each product and its billing code, which you can submit to your plan yourself.",
        ],
      },
      {
        heading: "About billing codes",
        paragraphs: [
          "Many products show a billing code, such as L1833 for some knee braces or L4361 for some walker boots. The code describes how a device is usually billed. It does not mean that your plan covers it, and it does not guarantee any reimbursement.",
        ],
      },
      {
        heading: "Questions to ask your insurer",
        list: [
          "Does my plan cover this billing code?",
          "Do I need a prescription or a letter of medical necessity?",
          "Will you reimburse me if I buy it myself and send a receipt?",
          "Is there a limit on how often the device can be replaced?",
        ],
        paragraphs: [],
      },
    ],
  },
  {
    slug: "medical-disclaimer",
    title: "Medical disclaimer",
    description: "The information on this site supports, and never replaces, advice from your own clinician.",
    sections: [
      {
        heading: "Information, not advice",
        paragraphs: [
          "The product descriptions, guides and fit tools on this website are general information. They are not medical advice, a diagnosis or a treatment plan. Conditions listed on a product page show what a device is commonly used for. They do not mean the device is right for you.",
        ],
      },
      {
        heading: "Talk to your clinician",
        paragraphs: [
          "Ask a doctor, physical therapist, orthotist or other licensed clinician before you use a brace or therapy device, especially after surgery, a fracture or a new injury, or if you have diabetes, circulation problems or reduced feeling in the area.",
        ],
      },
      {
        heading: "Get urgent help when you need it",
        paragraphs: [
          "If you have severe pain, numbness, a cold or discolored limb, or signs of infection, stop using the device and seek medical care. In an emergency call 911.",
        ],
      },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy policy",
    description: "What we collect when you send an order request, why, and how long we keep it.",
    sections: [
      {
        heading: "What we collect",
        paragraphs: [
          "When you send an order request we receive the details you type into the form: your name, email address, phone number if you give one, delivery address, the items in your cart and any note you add.",
          "This website does not use advertising trackers or analytics scripts. Your cart, your comparison list and recently viewed products are stored only in your own browser.",
        ],
      },
      {
        heading: "Why we use it",
        list: ["To confirm your order, the sizes and the total.", "To ship your order and send tracking.", "To answer questions you send us.", "To meet tax and accounting rules."],
        paragraphs: [],
      },
      {
        heading: "Health information",
        paragraphs: [
          "Please do not send us diagnoses or medical records. We only need what is required to choose a size and ship your order. If a note you add includes health details, we use them only to help with your order.",
        ],
      },
      {
        heading: "Who sees it",
        paragraphs: [
          "Our team, and the carriers and warehouses that ship your order. We do not sell or rent your information, and we do not share it for advertising.",
        ],
      },
      {
        heading: "How long we keep it",
        paragraphs: [
          "Order records are kept for as long as tax law requires. Requests that never become orders are deleted within twelve months. You can ask us to see, correct or delete your information at any time by email.",
        ],
      },
    ],
  },
  {
    slug: "terms",
    title: "Terms of use",
    description: "The rules for using this website and placing an order request.",
    sections: [
      {
        heading: "Order requests",
        paragraphs: [
          "Sending an order request does not create a contract. A contract is formed only when you approve our confirmation and pay. We may decline a request, for example when an item is discontinued or cannot be shipped to your address.",
        ],
      },
      {
        heading: "Prices and descriptions",
        paragraphs: [
          "We work to keep prices, sizes and descriptions accurate. Manufacturers change products and prices from time to time. If something on the site is wrong, the price and details in our confirmation are the ones that apply.",
        ],
      },
      {
        heading: "Trademarks",
        paragraphs: [
          "Product and brand names belong to their manufacturers and are used only to identify the products we offer. Their use does not mean that a manufacturer endorses this website.",
        ],
      },
      {
        heading: "Use of the site",
        paragraphs: [
          "Do not try to disrupt the site, copy the catalog in bulk or use it to send unwanted messages. The information on the site is provided as is. Read the medical disclaimer before relying on any of it.",
        ],
      },
    ],
  },
];

export const policyBySlug = (slug: string) => POLICIES.find((p) => p.slug === slug);

export const FAQS: { q: string; a: string }[] = [
  { q: "How do I pay?", a: "Send an order request from your cart. We confirm the sizes, stock and final total by email within one business day, with a secure payment link. This website never asks for card details." },
  { q: "How do I know which size to order?", a: "Each product page shows the manufacturer's sizing method. Our measuring guides show how to take the numbers. If you are unsure, add a note to your order request with your measurements and we will check them before you pay." },
  { q: "Do you take insurance?", a: "We do not bill insurance directly. On request we send an itemized receipt with billing codes, so you can submit a claim to your plan yourself. Ask your insurer about coverage before you order." },
  { q: "Do I need a prescription?", a: "Most supports can be ordered without one. Some rigid braces are usually fitted after a prescription, and your insurer may require one for reimbursement. When in doubt, ask your clinician first." },
  { q: "Can I return an item that does not fit?", a: "Yes, when it is unused and in its original packaging. If the size is wrong, contact us first. Most size problems can be solved with an exchange." },
  { q: "Which side should I order?", a: "Many braces are made for the left or the right. Choose the side of your body that needs support. For a hand or wrist brace that means the hand you will wear it on." },
  { q: "What does renewed mean?", a: "A renewed item has been returned, checked, cleaned and tested by the supplier. It works like new and may show light cosmetic wear. It is priced below a new unit." },
  { q: "Do you sell to clinics?", a: "Yes. Clinics, therapists and care teams can ask for volume pricing through the Clinician Partner Program." },
];
