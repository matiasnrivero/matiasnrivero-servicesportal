import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { serviceRequests, bundleRequests } from "../../shared/schema";
import { randomUUID } from "crypto";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const SERVICES = [
  { id: "38bfbd62-c5a5-4623-8964-7455bc2c4d9b", title: "Add Vectorization" },
  { id: "3728a8c9-78a6-4a64-a0fe-7cf131f317e0", title: "Artwork Composition" },
  { id: "64f01743-4477-4fd3-b278-dbdb4c83fafe", title: "Artwork Touch-Ups" },
  { id: "c1b6a4b5-0f1b-417e-9ad3-9a24c069d0a1", title: "Blank Product - PSD" },
  { id: "eaaefc78-7581-4ea1-baf1-05d9bb25fdb1", title: "Creative Art" },
  { id: "efdbe771-02c4-4cb2-86cd-b345bb4b7f36", title: "Dye-Sublimation Template" },
  { id: "e7ee5e28-6c0c-4ea9-82eb-a26d73aff86f", title: "Embroidery Digitizing" },
  { id: "5214ff0f-7663-4b4f-a879-c6c927b4e1a6", title: "Flyer Design" },
  { id: "ea5e1fa3-7c4a-4cd9-b0c5-bc25c5d558d5", title: "Store Banner Design" },
  { id: "9f28ced7-d481-4a8b-864d-2b443b9a3c7f", title: "Store Creation" },
  { id: "5bcbffde-f8f0-4583-8623-a37f06c95460", title: "Vectorization" },
];

const BUNDLES = [
  { id: "7dd5bccf-6473-45f3-82b7-7b8b503ba14a", name: "Bundle 1" },
  { id: "1a8ac456-456a-41b3-bcbc-5c5ff490b40c", name: "Bundle 2" },
  { id: "73c87cdb-7dd7-4cad-aff4-1c2c30d011e6", name: "Bundle 3" },
  { id: "dc8e6fa4-a239-4d56-a736-d024d6b10ef1", name: "Bundle 4" },
];

const VENDORS = {
  pixelsHive: {
    userId: "9903d7f7-2754-41a0-872f-62863489b22c",
    designerId: "30b2e6ca-12aa-4d4e-b663-cd6e2e563c7c",
  },
  artworkServiceCo: {
    userId: "3211a675-6259-4db8-8c27-31ab0668ab30",
    designerId: "6cfb409d-10a9-4404-a873-3c2dbcafef0c",
  },
};

const CLIENTS = {
  fusionBrands: {
    primary: "ac55c8c4-ed6a-42d7-88aa-d547fcf36265",
    member: "m1111111-aaaa-bbbb-cccc-ddddeeee1111",
  },
  marketlink: {
    primary: "c2222222-aaaa-bbbb-cccc-ddddeeee2222",
    member: "m2222222-aaaa-bbbb-cccc-ddddeeee2222",
  },
  shirtMommy: {
    primary: "c3333333-aaaa-bbbb-cccc-ddddeeee3333",
    member: "m3333333-aaaa-bbbb-cccc-ddddeeee3333",
  },
};

function generateJobId(prefix: string): string {
  const chars = "ABCDEF0123456789";
  let result = "";
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${result}`;
}

function getRandomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateDummyFormData(serviceTitle: string): Record<string, any> {
  return {
    customerName: `Customer for ${serviceTitle}`,
    quantity: Math.floor(Math.random() * 100) + 1,
    notes: `Test job for ${serviceTitle}`,
    uploadedFiles: [
      {
        name: "artwork_reference.png",
        url: "https://storage.googleapis.com/demo-bucket/artwork_reference.png",
        size: 1024000,
        type: "image/png",
      },
      {
        name: "design_specs.pdf",
        url: "https://storage.googleapis.com/demo-bucket/design_specs.pdf",
        size: 512000,
        type: "application/pdf",
      },
    ],
    decorationMethod: getRandomElement(["screen_print", "embroidery", "dtg", "sublimation"]),
  };
}

function generateBundleLineItemData(): Record<string, any> {
  return {
    items: [
      {
        serviceId: getRandomElement(SERVICES).id,
        quantity: Math.floor(Math.random() * 50) + 1,
        notes: "Bundle item notes",
        uploadedFiles: [
          {
            name: "bundle_artwork.png",
            url: "https://storage.googleapis.com/demo-bucket/bundle_artwork.png",
            size: 2048000,
            type: "image/png",
          },
        ],
      },
    ],
  };
}

interface JobConfig {
  userId: string;
  adhocCount: number;
  bundleCount: number;
  clientName: string;
}

async function createJobs(
  config: JobConfig,
  dateDistribution: { dec: number; jan: number },
  assignmentConfig: { assignedPercent: number; deliveredPercent: number }
) {
  const decStart = new Date("2025-12-01");
  const decEnd = new Date("2025-12-31");
  const janStart = new Date("2026-01-01");
  const janEnd = new Date("2026-01-05");

  const totalJobs = config.adhocCount + config.bundleCount;
  const decJobs = Math.floor(totalJobs * dateDistribution.dec);
  const janJobs = totalJobs - decJobs;

  const adhocInDec = Math.floor(config.adhocCount * dateDistribution.dec);
  const adhocInJan = config.adhocCount - adhocInDec;
  const bundleInDec = Math.floor(config.bundleCount * dateDistribution.dec);
  const bundleInJan = config.bundleCount - bundleInDec;

  const adhocJobs: any[] = [];
  const bundleJobs: any[] = [];

  let assignedCount = 0;
  let pixelsHiveCount = 0;
  let artworkCoCount = 0;
  const maxAssigned = Math.floor(totalJobs * assignmentConfig.assignedPercent);
  const maxPerVendor = Math.floor(maxAssigned / 2);

  for (let i = 0; i < config.adhocCount; i++) {
    const isDec = i < adhocInDec;
    const createdAt = isDec ? getRandomDate(decStart, decEnd) : getRandomDate(janStart, janEnd);
    const dueDate = new Date(createdAt.getTime() + (Math.random() * 14 + 3) * 24 * 60 * 60 * 1000);
    const service = getRandomElement(SERVICES);

    let assigneeId = null;
    let vendorAssigneeId = null;
    let status = "pending_assignment";
    let deliveredAt = null;
    let deliveredBy = null;
    let vendorCost = null;

    if (assignedCount < maxAssigned) {
      assignedCount++;
      const usePixelsHive = pixelsHiveCount < maxPerVendor;
      if (usePixelsHive) {
        pixelsHiveCount++;
        vendorAssigneeId = VENDORS.pixelsHive.userId;
        if (Math.random() < assignmentConfig.deliveredPercent) {
          assigneeId = VENDORS.pixelsHive.designerId;
          status = "delivered";
          deliveredAt = new Date(dueDate.getTime() - Math.random() * 2 * 24 * 60 * 60 * 1000);
          deliveredBy = VENDORS.pixelsHive.designerId;
          vendorCost = (Math.random() * 20 + 5).toFixed(2);
        } else {
          assigneeId = VENDORS.pixelsHive.designerId;
          status = "in_progress";
        }
      } else {
        artworkCoCount++;
        vendorAssigneeId = VENDORS.artworkServiceCo.userId;
        if (Math.random() < assignmentConfig.deliveredPercent) {
          assigneeId = VENDORS.artworkServiceCo.designerId;
          status = "delivered";
          deliveredAt = new Date(dueDate.getTime() - Math.random() * 2 * 24 * 60 * 60 * 1000);
          deliveredBy = VENDORS.artworkServiceCo.designerId;
          vendorCost = (Math.random() * 20 + 5).toFixed(2);
        } else {
          assigneeId = VENDORS.artworkServiceCo.designerId;
          status = "in_progress";
        }
      }
    }

    adhocJobs.push({
      id: randomUUID(),
      userId: config.userId,
      serviceId: service.id,
      status,
      orderNumber: generateJobId("A"),
      customerName: config.clientName,
      notes: `Ad-hoc job for ${service.title}`,
      quantity: Math.floor(Math.random() * 100) + 1,
      dueDate,
      createdAt,
      updatedAt: createdAt,
      assigneeId,
      vendorAssigneeId,
      deliveredAt,
      deliveredBy,
      formData: generateDummyFormData(service.title),
      decorationMethod: getRandomElement(["screen_print", "embroidery", "dtg", "sublimation"]),
      vendorCost,
    });
  }

  for (let i = 0; i < config.bundleCount; i++) {
    const isDec = i < bundleInDec;
    const createdAt = isDec ? getRandomDate(decStart, decEnd) : getRandomDate(janStart, janEnd);
    const dueDate = new Date(createdAt.getTime() + (Math.random() * 14 + 3) * 24 * 60 * 60 * 1000);
    const bundle = getRandomElement(BUNDLES);

    let assigneeId = null;
    let vendorAssigneeId = null;
    let status = "pending_assignment";
    let deliveredAt = null;
    let deliveredBy = null;
    let vendorCost = null;

    if (assignedCount < maxAssigned) {
      assignedCount++;
      const usePixelsHive = pixelsHiveCount < maxPerVendor;
      if (usePixelsHive) {
        pixelsHiveCount++;
        vendorAssigneeId = VENDORS.pixelsHive.userId;
        if (Math.random() < assignmentConfig.deliveredPercent) {
          assigneeId = VENDORS.pixelsHive.designerId;
          status = "delivered";
          deliveredAt = new Date(dueDate.getTime() - Math.random() * 2 * 24 * 60 * 60 * 1000);
          deliveredBy = VENDORS.pixelsHive.designerId;
          vendorCost = (Math.random() * 30 + 10).toFixed(2);
        } else {
          assigneeId = VENDORS.pixelsHive.designerId;
          status = "in_progress";
        }
      } else {
        artworkCoCount++;
        vendorAssigneeId = VENDORS.artworkServiceCo.userId;
        if (Math.random() < assignmentConfig.deliveredPercent) {
          assigneeId = VENDORS.artworkServiceCo.designerId;
          status = "delivered";
          deliveredAt = new Date(dueDate.getTime() - Math.random() * 2 * 24 * 60 * 60 * 1000);
          deliveredBy = VENDORS.artworkServiceCo.designerId;
          vendorCost = (Math.random() * 30 + 10).toFixed(2);
        } else {
          assigneeId = VENDORS.artworkServiceCo.designerId;
          status = "in_progress";
        }
      }
    }

    bundleJobs.push({
      id: randomUUID(),
      userId: config.userId,
      bundleId: bundle.id,
      status,
      notes: `Bundle job for ${bundle.name}`,
      dueDate,
      createdAt,
      updatedAt: createdAt,
      assigneeId,
      vendorAssigneeId,
      deliveredAt,
      deliveredBy,
      formData: generateDummyFormData(bundle.name),
      lineItemData: generateBundleLineItemData(),
      vendorCost,
    });
  }

  return { adhocJobs, bundleJobs };
}

async function seedJobs() {
  console.log("Starting job seeding...");

  const dateDistribution = { dec: 0.8, jan: 0.2 };
  const assignmentConfig = { assignedPercent: 0.8, deliveredPercent: 0.5 };

  const clientConfigs = [
    { userId: CLIENTS.fusionBrands.primary, adhocCount: 25, bundleCount: 40, clientName: "Fusion Brands (Ross)" },
    { userId: CLIENTS.fusionBrands.member, adhocCount: 25, bundleCount: 40, clientName: "Fusion Brands (Lourdes)" },
    { userId: CLIENTS.marketlink.primary, adhocCount: 59, bundleCount: 41, clientName: "Marketlink (Leighton)" },
    { userId: CLIENTS.marketlink.member, adhocCount: 71, bundleCount: 49, clientName: "Marketlink (Joe)" },
    { userId: CLIENTS.shirtMommy.primary, adhocCount: 87, bundleCount: 13, clientName: "Shirt Mommy (Tatiana)" },
    { userId: CLIENTS.shirtMommy.member, adhocCount: 43, bundleCount: 7, clientName: "Shirt Mommy (Santiago)" },
  ];

  let totalAdhoc = 0;
  let totalBundle = 0;

  for (const config of clientConfigs) {
    console.log(`Creating jobs for ${config.clientName}...`);
    const { adhocJobs, bundleJobs } = await createJobs(config, dateDistribution, assignmentConfig);

    if (adhocJobs.length > 0) {
      await db.insert(serviceRequests).values(adhocJobs);
      totalAdhoc += adhocJobs.length;
    }
    if (bundleJobs.length > 0) {
      await db.insert(bundleRequests).values(bundleJobs);
      totalBundle += bundleJobs.length;
    }

    console.log(`  Created ${adhocJobs.length} ad-hoc and ${bundleJobs.length} bundle jobs`);
  }

  console.log(`\nSeeding complete!`);
  console.log(`Total ad-hoc jobs created: ${totalAdhoc}`);
  console.log(`Total bundle jobs created: ${totalBundle}`);
  console.log(`Grand total: ${totalAdhoc + totalBundle} jobs`);
}

seedJobs()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
  });
