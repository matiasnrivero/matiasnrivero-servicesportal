import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, desc, and, or } from "drizzle-orm";
import {
  type User,
  type InsertUser,
  type Service,
  type InsertService,
  type ServiceRequest,
  type InsertServiceRequest,
  type UpdateServiceRequest,
  type ServiceAttachment,
  type InsertAttachment,
  type Comment,
  type InsertComment,
  type VendorProfile,
  type InsertVendorProfile,
  type UpdateVendorProfile,
  type SystemSetting,
  type BundleLineItem,
  type InsertBundleLineItem,
  type Bundle,
  type InsertBundle,
  type BundleItem,
  type InsertBundleItem,
  type ServicePack,
  type InsertServicePack,
  type ServicePackItem,
  type InsertServicePackItem,
  users,
  services,
  serviceRequests,
  serviceAttachments,
  comments,
  vendorProfiles,
  systemSettings,
  bundleLineItems,
  bundles,
  bundleItems,
  servicePacks,
  servicePackItems,
} from "@shared/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getUsersByRole(role: string): Promise<User[]>;
  getUsersByVendor(vendorId: string): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser & { isActive: boolean; lastLoginAt: Date }>): Promise<User | undefined>;

  // Vendor Profile methods
  getVendorProfile(userId: string): Promise<VendorProfile | undefined>;
  getVendorProfileById(id: string): Promise<VendorProfile | undefined>;
  getAllVendorProfiles(): Promise<VendorProfile[]>;
  createVendorProfile(profile: InsertVendorProfile): Promise<VendorProfile>;
  updateVendorProfile(id: string, profile: UpdateVendorProfile): Promise<VendorProfile | undefined>;

  // Service methods
  getAllServices(): Promise<Service[]>;
  getService(id: string): Promise<Service | undefined>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, service: Partial<InsertService>): Promise<Service | undefined>;

  // Service request methods
  getAllServiceRequests(): Promise<ServiceRequest[]>;
  getServiceRequest(id: string): Promise<ServiceRequest | undefined>;
  getServiceRequestsByUser(userId: string): Promise<ServiceRequest[]>;
  getServiceRequestsByAssignee(assigneeId: string): Promise<ServiceRequest[]>;
  getServiceRequestsByStatus(status: string): Promise<ServiceRequest[]>;
  createServiceRequest(request: InsertServiceRequest): Promise<ServiceRequest>;
  updateServiceRequest(id: string, request: UpdateServiceRequest): Promise<ServiceRequest | undefined>;
  assignDesigner(requestId: string, assigneeId: string): Promise<ServiceRequest | undefined>;
  deliverRequest(requestId: string, deliveredBy: string): Promise<ServiceRequest | undefined>;
  requestChange(requestId: string, changeNote: string): Promise<ServiceRequest | undefined>;

  // Attachment methods
  getAttachmentsByRequest(requestId: string): Promise<ServiceAttachment[]>;
  getAttachmentsByKind(requestId: string, kind: string): Promise<ServiceAttachment[]>;
  createAttachment(attachment: InsertAttachment): Promise<ServiceAttachment>;

  // Comment methods
  getCommentsByRequest(requestId: string, visibility?: string): Promise<Comment[]>;
  createComment(comment: InsertComment): Promise<Comment>;

  // System settings methods
  getSystemSetting(key: string): Promise<SystemSetting | undefined>;
  setSystemSetting(key: string, value: any): Promise<SystemSetting>;

  // Bundle Line Items methods
  getAllBundleLineItems(): Promise<BundleLineItem[]>;
  getBundleLineItem(id: string): Promise<BundleLineItem | undefined>;
  createBundleLineItem(data: InsertBundleLineItem): Promise<BundleLineItem>;
  updateBundleLineItem(id: string, data: Partial<InsertBundleLineItem>): Promise<BundleLineItem | undefined>;

  // Bundle methods
  getAllBundles(): Promise<Bundle[]>;
  getBundle(id: string): Promise<Bundle | undefined>;
  createBundle(data: InsertBundle): Promise<Bundle>;
  updateBundle(id: string, data: Partial<InsertBundle>): Promise<Bundle | undefined>;
  getBundleItems(bundleId: string): Promise<BundleItem[]>;
  addBundleItem(data: InsertBundleItem): Promise<BundleItem>;
  removeBundleItem(id: string): Promise<void>;

  // Service Pack methods
  getAllServicePacks(): Promise<ServicePack[]>;
  getServicePack(id: string): Promise<ServicePack | undefined>;
  createServicePack(data: InsertServicePack): Promise<ServicePack>;
  updateServicePack(id: string, data: Partial<InsertServicePack>): Promise<ServicePack | undefined>;
  getServicePackItems(packId: string): Promise<ServicePackItem[]>;
  addServicePackItem(data: InsertServicePackItem): Promise<ServicePackItem>;
  removeServicePackItem(id: string): Promise<void>;
}

export class DbStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.username);
  }

  async getUsersByRole(role: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.role, role)).orderBy(users.username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(id: string, data: Partial<InsertUser & { isActive: boolean; lastLoginAt: Date }>): Promise<User | undefined> {
    const result = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getUsersByVendor(vendorId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.vendorId, vendorId)).orderBy(users.username);
  }

  // Vendor Profile methods
  async getVendorProfile(userId: string): Promise<VendorProfile | undefined> {
    const result = await db.select().from(vendorProfiles).where(eq(vendorProfiles.userId, userId)).limit(1);
    return result[0];
  }

  async getVendorProfileById(id: string): Promise<VendorProfile | undefined> {
    const result = await db.select().from(vendorProfiles).where(eq(vendorProfiles.id, id)).limit(1);
    return result[0];
  }

  async getAllVendorProfiles(): Promise<VendorProfile[]> {
    return await db.select().from(vendorProfiles).orderBy(vendorProfiles.companyName);
  }

  async createVendorProfile(profile: InsertVendorProfile): Promise<VendorProfile> {
    const result = await db.insert(vendorProfiles).values(profile).returning();
    return result[0];
  }

  async updateVendorProfile(id: string, profile: UpdateVendorProfile): Promise<VendorProfile | undefined> {
    const result = await db.update(vendorProfiles)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(vendorProfiles.id, id))
      .returning();
    return result[0];
  }

  // Service methods
  async getAllServices(): Promise<Service[]> {
    return await db.select().from(services).where(eq(services.isActive, 1)).orderBy(services.title);
  }

  async getService(id: string): Promise<Service | undefined> {
    const result = await db.select().from(services).where(eq(services.id, id)).limit(1);
    return result[0];
  }

  async createService(service: InsertService): Promise<Service> {
    const result = await db.insert(services).values(service).returning();
    return result[0];
  }

  async updateService(id: string, service: Partial<InsertService>): Promise<Service | undefined> {
    const result = await db.update(services).set(service).where(eq(services.id, id)).returning();
    return result[0];
  }

  // Service request methods
  async getAllServiceRequests(): Promise<ServiceRequest[]> {
    return await db.select().from(serviceRequests).orderBy(desc(serviceRequests.createdAt));
  }

  async getServiceRequest(id: string): Promise<ServiceRequest | undefined> {
    const result = await db.select().from(serviceRequests).where(eq(serviceRequests.id, id)).limit(1);
    return result[0];
  }

  async getServiceRequestsByUser(userId: string): Promise<ServiceRequest[]> {
    return await db.select().from(serviceRequests)
      .where(eq(serviceRequests.userId, userId))
      .orderBy(desc(serviceRequests.createdAt));
  }

  async getServiceRequestsByAssignee(assigneeId: string): Promise<ServiceRequest[]> {
    return await db.select().from(serviceRequests)
      .where(eq(serviceRequests.assigneeId, assigneeId))
      .orderBy(desc(serviceRequests.createdAt));
  }

  async getServiceRequestsByStatus(status: string): Promise<ServiceRequest[]> {
    return await db.select().from(serviceRequests)
      .where(eq(serviceRequests.status, status))
      .orderBy(desc(serviceRequests.createdAt));
  }

  async createServiceRequest(request: InsertServiceRequest): Promise<ServiceRequest> {
    const result = await db.insert(serviceRequests).values(request).returning();
    return result[0];
  }

  async updateServiceRequest(id: string, request: UpdateServiceRequest): Promise<ServiceRequest | undefined> {
    const result = await db.update(serviceRequests)
      .set({ ...request, updatedAt: new Date() })
      .where(eq(serviceRequests.id, id))
      .returning();
    return result[0];
  }

  async assignDesigner(requestId: string, assigneeId: string): Promise<ServiceRequest | undefined> {
    const result = await db.update(serviceRequests)
      .set({ 
        assigneeId, 
        status: "in-progress",
        updatedAt: new Date() 
      })
      .where(eq(serviceRequests.id, requestId))
      .returning();
    return result[0];
  }

  async deliverRequest(requestId: string, deliveredBy: string): Promise<ServiceRequest | undefined> {
    const result = await db.update(serviceRequests)
      .set({ 
        status: "delivered",
        deliveredAt: new Date(),
        deliveredBy,
        changeRequestNote: null,
        updatedAt: new Date() 
      })
      .where(eq(serviceRequests.id, requestId))
      .returning();
    return result[0];
  }

  async requestChange(requestId: string, changeNote: string): Promise<ServiceRequest | undefined> {
    const result = await db.update(serviceRequests)
      .set({ 
        status: "change-request",
        changeRequestNote: changeNote,
        updatedAt: new Date() 
      })
      .where(eq(serviceRequests.id, requestId))
      .returning();
    return result[0];
  }

  // Attachment methods
  async getAttachmentsByRequest(requestId: string): Promise<ServiceAttachment[]> {
    return await db.select().from(serviceAttachments)
      .where(eq(serviceAttachments.requestId, requestId))
      .orderBy(serviceAttachments.uploadedAt);
  }

  async getAttachmentsByKind(requestId: string, kind: string): Promise<ServiceAttachment[]> {
    return await db.select().from(serviceAttachments)
      .where(and(
        eq(serviceAttachments.requestId, requestId),
        eq(serviceAttachments.kind, kind)
      ))
      .orderBy(serviceAttachments.uploadedAt);
  }

  async createAttachment(attachment: InsertAttachment): Promise<ServiceAttachment> {
    const result = await db.insert(serviceAttachments).values(attachment).returning();
    return result[0];
  }

  // Comment methods
  async getCommentsByRequest(requestId: string, visibility?: string): Promise<Comment[]> {
    if (visibility) {
      return await db.select().from(comments)
        .where(and(
          eq(comments.requestId, requestId),
          eq(comments.visibility, visibility)
        ))
        .orderBy(comments.createdAt);
    }
    return await db.select().from(comments)
      .where(eq(comments.requestId, requestId))
      .orderBy(comments.createdAt);
  }

  async createComment(comment: InsertComment): Promise<Comment> {
    const result = await db.insert(comments).values(comment).returning();
    return result[0];
  }

  // System settings methods
  async getSystemSetting(key: string): Promise<SystemSetting | undefined> {
    const result = await db.select().from(systemSettings).where(eq(systemSettings.settingKey, key)).limit(1);
    return result[0];
  }

  async setSystemSetting(key: string, value: any): Promise<SystemSetting> {
    const existing = await this.getSystemSetting(key);
    if (existing) {
      const result = await db.update(systemSettings)
        .set({ settingValue: value, updatedAt: new Date() })
        .where(eq(systemSettings.settingKey, key))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(systemSettings)
        .values({ settingKey: key, settingValue: value })
        .returning();
      return result[0];
    }
  }

  // Bundle Line Items methods
  async getAllBundleLineItems(): Promise<BundleLineItem[]> {
    return await db.select().from(bundleLineItems).orderBy(bundleLineItems.name);
  }

  async getBundleLineItem(id: string): Promise<BundleLineItem | undefined> {
    const result = await db.select().from(bundleLineItems).where(eq(bundleLineItems.id, id)).limit(1);
    return result[0];
  }

  async createBundleLineItem(data: InsertBundleLineItem): Promise<BundleLineItem> {
    const result = await db.insert(bundleLineItems).values(data).returning();
    return result[0];
  }

  async updateBundleLineItem(id: string, data: Partial<InsertBundleLineItem>): Promise<BundleLineItem | undefined> {
    const result = await db.update(bundleLineItems).set(data).where(eq(bundleLineItems.id, id)).returning();
    return result[0];
  }

  // Bundle methods
  async getAllBundles(): Promise<Bundle[]> {
    return await db.select().from(bundles).orderBy(bundles.name);
  }

  async getBundle(id: string): Promise<Bundle | undefined> {
    const result = await db.select().from(bundles).where(eq(bundles.id, id)).limit(1);
    return result[0];
  }

  async createBundle(data: InsertBundle): Promise<Bundle> {
    const result = await db.insert(bundles).values(data).returning();
    return result[0];
  }

  async updateBundle(id: string, data: Partial<InsertBundle>): Promise<Bundle | undefined> {
    const result = await db.update(bundles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(bundles.id, id))
      .returning();
    return result[0];
  }

  async getBundleItems(bundleId: string): Promise<BundleItem[]> {
    return await db.select().from(bundleItems).where(eq(bundleItems.bundleId, bundleId));
  }

  async addBundleItem(data: InsertBundleItem): Promise<BundleItem> {
    const result = await db.insert(bundleItems).values(data).returning();
    return result[0];
  }

  async removeBundleItem(id: string): Promise<void> {
    await db.delete(bundleItems).where(eq(bundleItems.id, id));
  }

  // Service Pack methods
  async getAllServicePacks(): Promise<ServicePack[]> {
    return await db.select().from(servicePacks).orderBy(servicePacks.name);
  }

  async getServicePack(id: string): Promise<ServicePack | undefined> {
    const result = await db.select().from(servicePacks).where(eq(servicePacks.id, id)).limit(1);
    return result[0];
  }

  async createServicePack(data: InsertServicePack): Promise<ServicePack> {
    const result = await db.insert(servicePacks).values(data).returning();
    return result[0];
  }

  async updateServicePack(id: string, data: Partial<InsertServicePack>): Promise<ServicePack | undefined> {
    const result = await db.update(servicePacks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(servicePacks.id, id))
      .returning();
    return result[0];
  }

  async getServicePackItems(packId: string): Promise<ServicePackItem[]> {
    return await db.select().from(servicePackItems).where(eq(servicePackItems.packId, packId));
  }

  async addServicePackItem(data: InsertServicePackItem): Promise<ServicePackItem> {
    const result = await db.insert(servicePackItems).values(data).returning();
    return result[0];
  }

  async removeServicePackItem(id: string): Promise<void> {
    await db.delete(servicePackItems).where(eq(servicePackItems.id, id));
  }
}

export const storage = new DbStorage();
