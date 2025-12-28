import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq, desc, and, or, isNull } from "drizzle-orm";
import {
  type User,
  type InsertUser,
  type Service,
  type InsertService,
  type UpdateService,
  type ServicePricingTier,
  type InsertServicePricingTier,
  type UpdateServicePricingTier,
  type ServiceRequest,
  type InsertServiceRequest,
  type UpdateServiceRequest,
  type ServiceDelivery,
  type InsertServiceDelivery,
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
  type InputField,
  type InsertInputField,
  type UpdateInputField,
  type ServiceField,
  type InsertServiceField,
  type UpdateServiceField,
  type LineItemField,
  type InsertLineItemField,
  type UpdateLineItemField,
  type BundleField,
  type InsertBundleField,
  type UpdateBundleField,
  type VendorBundleCost,
  type InsertVendorBundleCost,
  type VendorPackCost,
  type InsertVendorPackCost,
  type BundleRequest,
  type InsertBundleRequest,
  type UpdateBundleRequest,
  type BundleRequestAttachment,
  type InsertBundleRequestAttachment,
  type BundleRequestComment,
  type InsertBundleRequestComment,
  type VendorServiceCapacity,
  type InsertVendorServiceCapacity,
  type UpdateVendorServiceCapacity,
  type VendorDesignerCapacity,
  type InsertVendorDesignerCapacity,
  type UpdateVendorDesignerCapacity,
  type AutomationRule,
  type InsertAutomationRule,
  type UpdateAutomationRule,
  type AutomationAssignmentLog,
  type InsertAutomationAssignmentLog,
  type ClientProfile,
  type InsertClientProfile,
  type UpdateClientProfile,
  users,
  services,
  servicePricingTiers,
  serviceRequests,
  serviceDeliveries,
  serviceAttachments,
  comments,
  vendorProfiles,
  systemSettings,
  bundleLineItems,
  bundles,
  bundleItems,
  servicePacks,
  servicePackItems,
  inputFields,
  serviceFields,
  lineItemFields,
  bundleFields,
  vendorBundleCosts,
  vendorPackCosts,
  bundleRequests,
  bundleRequestAttachments,
  bundleRequestComments,
  vendorServiceCapacities,
  vendorDesignerCapacities,
  automationRules,
  automationAssignmentLogs,
  clientProfiles,
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
  deleteVendor(profileId: string): Promise<void>;

  // Client Profile methods
  getClientProfile(userId: string): Promise<ClientProfile | undefined>;
  getClientProfileById(id: string): Promise<ClientProfile | undefined>;
  getAllClientProfiles(): Promise<ClientProfile[]>;
  createClientProfile(profile: InsertClientProfile): Promise<ClientProfile>;
  updateClientProfile(id: string, profile: UpdateClientProfile): Promise<ClientProfile | undefined>;
  deleteClientProfile(profileId: string): Promise<void>;
  getClientTeamMembers(clientProfileId: string): Promise<User[]>;

  // Service methods
  getAllServices(): Promise<Service[]>;
  getActiveServices(): Promise<Service[]>;
  getFatherServices(): Promise<Service[]>;
  getChildServices(parentId: string): Promise<Service[]>;
  getService(id: string): Promise<Service | undefined>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, service: Partial<InsertService>): Promise<Service | undefined>;
  deleteService(id: string): Promise<void>;

  // Service Pricing Tiers methods
  getServicePricingTiers(serviceId: string): Promise<ServicePricingTier[]>;
  createServicePricingTier(tier: InsertServicePricingTier): Promise<ServicePricingTier>;
  updateServicePricingTier(id: string, tier: UpdateServicePricingTier): Promise<ServicePricingTier | undefined>;
  deleteServicePricingTier(id: string): Promise<void>;
  deleteServicePricingTiersByService(serviceId: string): Promise<void>;

  // Service request methods
  getAllServiceRequests(): Promise<ServiceRequest[]>;
  getServiceRequest(id: string): Promise<ServiceRequest | undefined>;
  getServiceRequestsByUser(userId: string): Promise<ServiceRequest[]>;
  getServiceRequestsByAssignee(assigneeId: string): Promise<ServiceRequest[]>;
  getServiceRequestsByStatus(status: string): Promise<ServiceRequest[]>;
  createServiceRequest(request: InsertServiceRequest): Promise<ServiceRequest>;
  updateServiceRequest(id: string, request: UpdateServiceRequest): Promise<ServiceRequest | undefined>;
  assignDesigner(requestId: string, assigneeId: string): Promise<ServiceRequest | undefined>;
  assignVendor(requestId: string, vendorId: string): Promise<ServiceRequest | undefined>;
  deliverRequest(requestId: string, deliveredBy: string): Promise<ServiceRequest | undefined>;
  requestChange(requestId: string, changeNote: string): Promise<ServiceRequest | undefined>;
  deleteServiceRequest(id: string): Promise<void>;

  // Service Delivery methods (file versioning)
  getDeliveriesByRequest(requestId: string): Promise<ServiceDelivery[]>;
  getLatestDeliveryVersion(requestId: string): Promise<number>;
  createDelivery(delivery: InsertServiceDelivery): Promise<ServiceDelivery>;
  linkAttachmentsToDelivery(attachmentIds: string[], deliveryId: string): Promise<void>;

  // Attachment methods
  getAttachmentsByRequest(requestId: string): Promise<ServiceAttachment[]>;
  getAttachmentsByKind(requestId: string, kind: string): Promise<ServiceAttachment[]>;
  createAttachment(attachment: InsertAttachment): Promise<ServiceAttachment>;
  getAttachment(id: string): Promise<ServiceAttachment | undefined>;
  deleteAttachment(id: string): Promise<void>;

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
  deleteBundleLineItem(id: string): Promise<void>;

  // Bundle methods
  getAllBundles(): Promise<Bundle[]>;
  getBundle(id: string): Promise<Bundle | undefined>;
  createBundle(data: InsertBundle): Promise<Bundle>;
  updateBundle(id: string, data: Partial<InsertBundle>): Promise<Bundle | undefined>;
  deleteBundle(id: string): Promise<void>;
  getBundleItems(bundleId: string): Promise<BundleItem[]>;
  addBundleItem(data: InsertBundleItem): Promise<BundleItem>;
  removeBundleItem(id: string): Promise<void>;

  // Service Pack methods
  getAllServicePacks(): Promise<ServicePack[]>;
  getServicePack(id: string): Promise<ServicePack | undefined>;
  createServicePack(data: InsertServicePack): Promise<ServicePack>;
  updateServicePack(id: string, data: Partial<InsertServicePack>): Promise<ServicePack | undefined>;
  deleteServicePack(id: string): Promise<void>;
  getServicePackItems(packId: string): Promise<ServicePackItem[]>;
  addServicePackItem(data: InsertServicePackItem): Promise<ServicePackItem>;
  removeServicePackItem(id: string): Promise<void>;

  // Input Field methods
  getAllInputFields(): Promise<InputField[]>;
  getInputField(id: string): Promise<InputField | undefined>;
  getInputFieldByKey(fieldKey: string): Promise<InputField | undefined>;
  createInputField(data: InsertInputField): Promise<InputField>;
  updateInputField(id: string, data: UpdateInputField): Promise<InputField | undefined>;
  deleteInputField(id: string): Promise<void>;

  // Service Field methods
  getServiceFields(serviceId: string): Promise<ServiceField[]>;
  getServiceField(id: string): Promise<ServiceField | undefined>;
  getServiceFieldsByInputField(inputFieldId: string): Promise<ServiceField[]>;
  createServiceField(data: InsertServiceField): Promise<ServiceField>;
  updateServiceField(id: string, data: UpdateServiceField): Promise<ServiceField | undefined>;
  deleteServiceField(id: string): Promise<void>;

  // Line Item Field methods
  getLineItemFields(lineItemId: string): Promise<LineItemField[]>;
  getLineItemField(id: string): Promise<LineItemField | undefined>;
  getLineItemFieldsByInputField(inputFieldId: string): Promise<LineItemField[]>;
  createLineItemField(data: InsertLineItemField): Promise<LineItemField>;
  updateLineItemField(id: string, data: UpdateLineItemField): Promise<LineItemField | undefined>;
  deleteLineItemField(id: string): Promise<void>;

  // Bundle Field methods
  getBundleFields(bundleId: string): Promise<BundleField[]>;
  getBundleField(id: string): Promise<BundleField | undefined>;
  getBundleFieldsByInputField(inputFieldId: string): Promise<BundleField[]>;
  createBundleField(data: InsertBundleField): Promise<BundleField>;
  updateBundleField(id: string, data: UpdateBundleField): Promise<BundleField | undefined>;
  deleteBundleField(id: string): Promise<void>;

  // Vendor Bundle Cost methods
  getAllVendorBundleCosts(): Promise<VendorBundleCost[]>;
  getVendorBundleCosts(vendorId: string): Promise<VendorBundleCost[]>;
  getVendorBundleCost(vendorId: string, bundleId: string): Promise<VendorBundleCost | undefined>;
  upsertVendorBundleCost(vendorId: string, bundleId: string, cost: string): Promise<VendorBundleCost>;

  // Vendor Pack Cost methods
  getVendorPackCosts(vendorId: string): Promise<VendorPackCost[]>;
  getVendorPackCost(vendorId: string, packId: string): Promise<VendorPackCost | undefined>;
  upsertVendorPackCost(vendorId: string, packId: string, cost: string): Promise<VendorPackCost>;

  // Bundle Request methods
  getAllBundleRequests(): Promise<BundleRequest[]>;
  getBundleRequest(id: string): Promise<BundleRequest | undefined>;
  getBundleRequestsByUser(userId: string): Promise<BundleRequest[]>;
  getBundleRequestsByAssignee(assigneeId: string): Promise<BundleRequest[]>;
  getBundleRequestsByStatus(status: string): Promise<BundleRequest[]>;
  createBundleRequest(request: InsertBundleRequest): Promise<BundleRequest>;
  updateBundleRequest(id: string, request: UpdateBundleRequest): Promise<BundleRequest | undefined>;
  assignBundleDesigner(requestId: string, assigneeId: string): Promise<BundleRequest | undefined>;
  assignBundleVendor(requestId: string, vendorId: string): Promise<BundleRequest | undefined>;
  deliverBundleRequest(requestId: string, deliveredBy: string, finalStoreUrl?: string): Promise<BundleRequest | undefined>;
  requestBundleChange(requestId: string, changeNote: string): Promise<BundleRequest | undefined>;

  // Bundle Request Attachment methods
  getBundleRequestAttachments(requestId: string): Promise<BundleRequestAttachment[]>;
  createBundleRequestAttachment(attachment: InsertBundleRequestAttachment): Promise<BundleRequestAttachment>;

  // Bundle Request Comment methods
  getBundleRequestComments(requestId: string): Promise<BundleRequestComment[]>;
  createBundleRequestComment(comment: InsertBundleRequestComment): Promise<BundleRequestComment>;

  // Vendor Service Capacity methods
  getVendorServiceCapacities(vendorProfileId: string): Promise<VendorServiceCapacity[]>;
  getVendorServiceCapacity(vendorProfileId: string, serviceId: string): Promise<VendorServiceCapacity | undefined>;
  getVendorServiceCapacityById(id: string): Promise<VendorServiceCapacity | undefined>;
  getAllVendorServiceCapacities(): Promise<VendorServiceCapacity[]>;
  createVendorServiceCapacity(data: InsertVendorServiceCapacity): Promise<VendorServiceCapacity>;
  updateVendorServiceCapacity(id: string, data: UpdateVendorServiceCapacity): Promise<VendorServiceCapacity | undefined>;
  deleteVendorServiceCapacity(id: string): Promise<void>;
  upsertVendorServiceCapacity(data: InsertVendorServiceCapacity): Promise<VendorServiceCapacity>;

  // Vendor Designer Capacity methods
  getVendorDesignerCapacities(userId: string): Promise<VendorDesignerCapacity[]>;
  getVendorDesignerCapacity(userId: string, serviceId: string): Promise<VendorDesignerCapacity | undefined>;
  getVendorDesignerCapacityById(id: string): Promise<VendorDesignerCapacity | undefined>;
  getAllVendorDesignerCapacities(): Promise<VendorDesignerCapacity[]>;
  createVendorDesignerCapacity(data: InsertVendorDesignerCapacity): Promise<VendorDesignerCapacity>;
  updateVendorDesignerCapacity(id: string, data: UpdateVendorDesignerCapacity): Promise<VendorDesignerCapacity | undefined>;
  deleteVendorDesignerCapacity(id: string): Promise<void>;
  upsertVendorDesignerCapacity(data: InsertVendorDesignerCapacity): Promise<VendorDesignerCapacity>;

  // Automation Rule methods
  getAllAutomationRules(): Promise<AutomationRule[]>;
  getAutomationRulesByScope(scope: string): Promise<AutomationRule[]>;
  getAutomationRulesByOwner(ownerVendorId: string): Promise<AutomationRule[]>;
  getAutomationRule(id: string): Promise<AutomationRule | undefined>;
  createAutomationRule(data: InsertAutomationRule): Promise<AutomationRule>;
  updateAutomationRule(id: string, data: UpdateAutomationRule): Promise<AutomationRule | undefined>;
  deleteAutomationRule(id: string): Promise<void>;

  // Automation Assignment Log methods
  getAutomationLogsByRequest(requestId: string): Promise<AutomationAssignmentLog[]>;
  createAutomationLog(data: InsertAutomationAssignmentLog): Promise<AutomationAssignmentLog>;
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
    return await db.select().from(vendorProfiles)
      .where(isNull(vendorProfiles.deletedAt))
      .orderBy(vendorProfiles.companyName);
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

  async deleteVendor(profileId: string): Promise<void> {
    const profile = await this.getVendorProfileById(profileId);
    if (!profile) return;

    await db.update(vendorProfiles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(vendorProfiles.id, profileId));

    await db.update(users)
      .set({ isActive: false })
      .where(eq(users.id, profile.userId));

    await db.update(users)
      .set({ isActive: false })
      .where(eq(users.vendorId, profile.userId));
  }

  // Client Profile methods
  async getClientProfile(userId: string): Promise<ClientProfile | undefined> {
    const result = await db.select().from(clientProfiles).where(eq(clientProfiles.primaryUserId, userId)).limit(1);
    return result[0];
  }

  async getClientProfileById(id: string): Promise<ClientProfile | undefined> {
    const result = await db.select().from(clientProfiles).where(eq(clientProfiles.id, id)).limit(1);
    return result[0];
  }

  async getAllClientProfiles(): Promise<ClientProfile[]> {
    return await db.select().from(clientProfiles)
      .where(isNull(clientProfiles.deletedAt))
      .orderBy(clientProfiles.companyName);
  }

  async createClientProfile(profile: InsertClientProfile): Promise<ClientProfile> {
    const result = await db.insert(clientProfiles).values(profile).returning();
    return result[0];
  }

  async updateClientProfile(id: string, profile: UpdateClientProfile): Promise<ClientProfile | undefined> {
    const result = await db.update(clientProfiles)
      .set({ ...profile, updatedAt: new Date() })
      .where(eq(clientProfiles.id, id))
      .returning();
    return result[0];
  }

  async deleteClientProfile(profileId: string): Promise<void> {
    const profile = await this.getClientProfileById(profileId);
    if (!profile) return;

    await db.update(clientProfiles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(clientProfiles.id, profileId));

    await db.update(users)
      .set({ isActive: false })
      .where(eq(users.clientProfileId, profileId));
  }

  async getClientTeamMembers(clientProfileId: string): Promise<User[]> {
    return await db.select().from(users)
      .where(eq(users.clientProfileId, clientProfileId))
      .orderBy(users.username);
  }

  // Service methods
  async getAllServices(): Promise<Service[]> {
    return await db.select().from(services).orderBy(services.title);
  }

  async getActiveServices(): Promise<Service[]> {
    return await db.select().from(services).where(eq(services.isActive, 1)).orderBy(services.title);
  }

  async getFatherServices(): Promise<Service[]> {
    return await db.select().from(services)
      .where(and(
        eq(services.isActive, 1),
        eq(services.serviceHierarchy, "father")
      ))
      .orderBy(services.displayOrder);
  }

  async getChildServices(parentId: string): Promise<Service[]> {
    return await db.select().from(services)
      .where(and(
        eq(services.isActive, 1),
        eq(services.parentServiceId, parentId)
      ))
      .orderBy(services.displayOrder);
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

  async deleteService(id: string): Promise<void> {
    await db.delete(services).where(eq(services.id, id));
  }

  // Service Pricing Tiers methods
  async getServicePricingTiers(serviceId: string): Promise<ServicePricingTier[]> {
    return await db.select().from(servicePricingTiers)
      .where(eq(servicePricingTiers.serviceId, serviceId))
      .orderBy(servicePricingTiers.sortOrder);
  }

  async createServicePricingTier(tier: InsertServicePricingTier): Promise<ServicePricingTier> {
    const result = await db.insert(servicePricingTiers).values(tier).returning();
    return result[0];
  }

  async updateServicePricingTier(id: string, tier: UpdateServicePricingTier): Promise<ServicePricingTier | undefined> {
    const result = await db.update(servicePricingTiers)
      .set(tier)
      .where(eq(servicePricingTiers.id, id))
      .returning();
    return result[0];
  }

  async deleteServicePricingTier(id: string): Promise<void> {
    await db.delete(servicePricingTiers).where(eq(servicePricingTiers.id, id));
  }

  async deleteServicePricingTiersByService(serviceId: string): Promise<void> {
    await db.delete(servicePricingTiers).where(eq(servicePricingTiers.serviceId, serviceId));
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
        assignedAt: new Date(),
        status: "in-progress",
        updatedAt: new Date() 
      })
      .where(eq(serviceRequests.id, requestId))
      .returning();
    return result[0];
  }

  async assignVendor(requestId: string, vendorId: string): Promise<ServiceRequest | undefined> {
    const result = await db.update(serviceRequests)
      .set({ 
        vendorAssigneeId: vendorId,
        vendorAssignedAt: new Date(),
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

  async deleteServiceRequest(id: string): Promise<void> {
    await db.delete(serviceRequests).where(eq(serviceRequests.id, id));
  }

  // Service Delivery methods (file versioning)
  async getDeliveriesByRequest(requestId: string): Promise<ServiceDelivery[]> {
    return await db.select().from(serviceDeliveries)
      .where(eq(serviceDeliveries.requestId, requestId))
      .orderBy(desc(serviceDeliveries.version));
  }

  async getLatestDeliveryVersion(requestId: string): Promise<number> {
    const result = await db.select().from(serviceDeliveries)
      .where(eq(serviceDeliveries.requestId, requestId))
      .orderBy(desc(serviceDeliveries.version))
      .limit(1);
    return result.length > 0 ? result[0].version : 0;
  }

  async createDelivery(delivery: InsertServiceDelivery): Promise<ServiceDelivery> {
    const result = await db.insert(serviceDeliveries).values(delivery).returning();
    return result[0];
  }

  async linkAttachmentsToDelivery(attachmentIds: string[], deliveryId: string): Promise<void> {
    if (attachmentIds.length === 0) return;
    
    for (const attachmentId of attachmentIds) {
      await db.update(serviceAttachments)
        .set({ deliveryId })
        .where(eq(serviceAttachments.id, attachmentId));
    }
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

  async getAttachment(id: string): Promise<ServiceAttachment | undefined> {
    const result = await db.select().from(serviceAttachments)
      .where(eq(serviceAttachments.id, id))
      .limit(1);
    return result[0];
  }

  async deleteAttachment(id: string): Promise<void> {
    await db.delete(serviceAttachments).where(eq(serviceAttachments.id, id));
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

  async deleteBundleLineItem(id: string): Promise<void> {
    await db.delete(bundleLineItems).where(eq(bundleLineItems.id, id));
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

  async deleteBundle(id: string): Promise<void> {
    await db.delete(bundleItems).where(eq(bundleItems.bundleId, id));
    await db.delete(bundles).where(eq(bundles.id, id));
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

  async deleteServicePack(id: string): Promise<void> {
    await db.delete(servicePackItems).where(eq(servicePackItems.packId, id));
    await db.delete(servicePacks).where(eq(servicePacks.id, id));
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

  // Input Field methods
  async getAllInputFields(): Promise<InputField[]> {
    return await db.select().from(inputFields).orderBy(inputFields.sortOrder, inputFields.label);
  }

  async getInputField(id: string): Promise<InputField | undefined> {
    const result = await db.select().from(inputFields).where(eq(inputFields.id, id)).limit(1);
    return result[0];
  }

  async getInputFieldByKey(fieldKey: string): Promise<InputField | undefined> {
    const result = await db.select().from(inputFields).where(eq(inputFields.fieldKey, fieldKey)).limit(1);
    return result[0];
  }

  async createInputField(data: InsertInputField): Promise<InputField> {
    const result = await db.insert(inputFields).values(data).returning();
    return result[0];
  }

  async updateInputField(id: string, data: UpdateInputField): Promise<InputField | undefined> {
    const result = await db.update(inputFields)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(inputFields.id, id))
      .returning();
    return result[0];
  }

  async deleteInputField(id: string): Promise<void> {
    await db.delete(serviceFields).where(eq(serviceFields.inputFieldId, id));
    await db.delete(lineItemFields).where(eq(lineItemFields.inputFieldId, id));
    await db.delete(inputFields).where(eq(inputFields.id, id));
  }

  // Service Field methods
  async getServiceFields(serviceId: string): Promise<ServiceField[]> {
    return await db.select().from(serviceFields)
      .where(eq(serviceFields.serviceId, serviceId))
      .orderBy(serviceFields.sortOrder);
  }

  async getServiceField(id: string): Promise<ServiceField | undefined> {
    const result = await db.select().from(serviceFields).where(eq(serviceFields.id, id)).limit(1);
    return result[0];
  }

  async getServiceFieldsByInputField(inputFieldId: string): Promise<ServiceField[]> {
    return await db.select().from(serviceFields).where(eq(serviceFields.inputFieldId, inputFieldId));
  }

  async createServiceField(data: InsertServiceField): Promise<ServiceField> {
    const result = await db.insert(serviceFields).values(data).returning();
    return result[0];
  }

  async updateServiceField(id: string, data: UpdateServiceField): Promise<ServiceField | undefined> {
    const result = await db.update(serviceFields)
      .set(data)
      .where(eq(serviceFields.id, id))
      .returning();
    return result[0];
  }

  async deleteServiceField(id: string): Promise<void> {
    await db.delete(serviceFields).where(eq(serviceFields.id, id));
  }

  // Line Item Field methods
  async getLineItemFields(lineItemId: string): Promise<LineItemField[]> {
    return await db.select().from(lineItemFields)
      .where(eq(lineItemFields.lineItemId, lineItemId))
      .orderBy(lineItemFields.sortOrder);
  }

  async getLineItemField(id: string): Promise<LineItemField | undefined> {
    const result = await db.select().from(lineItemFields).where(eq(lineItemFields.id, id)).limit(1);
    return result[0];
  }

  async getLineItemFieldsByInputField(inputFieldId: string): Promise<LineItemField[]> {
    return await db.select().from(lineItemFields).where(eq(lineItemFields.inputFieldId, inputFieldId));
  }

  async createLineItemField(data: InsertLineItemField): Promise<LineItemField> {
    const result = await db.insert(lineItemFields).values(data).returning();
    return result[0];
  }

  async updateLineItemField(id: string, data: UpdateLineItemField): Promise<LineItemField | undefined> {
    const result = await db.update(lineItemFields)
      .set(data)
      .where(eq(lineItemFields.id, id))
      .returning();
    return result[0];
  }

  async deleteLineItemField(id: string): Promise<void> {
    await db.delete(lineItemFields).where(eq(lineItemFields.id, id));
  }

  // Bundle Field methods
  async getBundleFields(bundleId: string): Promise<BundleField[]> {
    return await db.select().from(bundleFields)
      .where(eq(bundleFields.bundleId, bundleId))
      .orderBy(bundleFields.sortOrder);
  }

  async getBundleField(id: string): Promise<BundleField | undefined> {
    const result = await db.select().from(bundleFields).where(eq(bundleFields.id, id)).limit(1);
    return result[0];
  }

  async getBundleFieldsByInputField(inputFieldId: string): Promise<BundleField[]> {
    return await db.select().from(bundleFields).where(eq(bundleFields.inputFieldId, inputFieldId));
  }

  async createBundleField(data: InsertBundleField): Promise<BundleField> {
    const result = await db.insert(bundleFields).values(data).returning();
    return result[0];
  }

  async updateBundleField(id: string, data: UpdateBundleField): Promise<BundleField | undefined> {
    const result = await db.update(bundleFields)
      .set(data)
      .where(eq(bundleFields.id, id))
      .returning();
    return result[0];
  }

  async deleteBundleField(id: string): Promise<void> {
    await db.delete(bundleFields).where(eq(bundleFields.id, id));
  }

  // Vendor Bundle Cost methods
  async getAllVendorBundleCosts(): Promise<VendorBundleCost[]> {
    return await db.select().from(vendorBundleCosts);
  }

  async getVendorBundleCosts(vendorId: string): Promise<VendorBundleCost[]> {
    return await db.select().from(vendorBundleCosts).where(eq(vendorBundleCosts.vendorId, vendorId));
  }

  async getVendorBundleCost(vendorId: string, bundleId: string): Promise<VendorBundleCost | undefined> {
    const result = await db.select().from(vendorBundleCosts)
      .where(and(
        eq(vendorBundleCosts.vendorId, vendorId),
        eq(vendorBundleCosts.bundleId, bundleId)
      ))
      .limit(1);
    return result[0];
  }

  async upsertVendorBundleCost(vendorId: string, bundleId: string, cost: string): Promise<VendorBundleCost> {
    const existing = await this.getVendorBundleCost(vendorId, bundleId);
    if (existing) {
      const result = await db.update(vendorBundleCosts)
        .set({ cost, updatedAt: new Date() })
        .where(eq(vendorBundleCosts.id, existing.id))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(vendorBundleCosts)
        .values({ vendorId, bundleId, cost })
        .returning();
      return result[0];
    }
  }

  // Vendor Pack Cost methods
  async getVendorPackCosts(vendorId: string): Promise<VendorPackCost[]> {
    return await db.select().from(vendorPackCosts).where(eq(vendorPackCosts.vendorId, vendorId));
  }

  async getVendorPackCost(vendorId: string, packId: string): Promise<VendorPackCost | undefined> {
    const result = await db.select().from(vendorPackCosts)
      .where(and(
        eq(vendorPackCosts.vendorId, vendorId),
        eq(vendorPackCosts.packId, packId)
      ))
      .limit(1);
    return result[0];
  }

  async upsertVendorPackCost(vendorId: string, packId: string, cost: string): Promise<VendorPackCost> {
    const existing = await this.getVendorPackCost(vendorId, packId);
    if (existing) {
      const result = await db.update(vendorPackCosts)
        .set({ cost, updatedAt: new Date() })
        .where(eq(vendorPackCosts.id, existing.id))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(vendorPackCosts)
        .values({ vendorId, packId, cost })
        .returning();
      return result[0];
    }
  }

  // Bundle Request methods
  async getAllBundleRequests(): Promise<BundleRequest[]> {
    return await db.select().from(bundleRequests).orderBy(bundleRequests.createdAt);
  }

  async getBundleRequest(id: string): Promise<BundleRequest | undefined> {
    const result = await db.select().from(bundleRequests).where(eq(bundleRequests.id, id)).limit(1);
    return result[0];
  }

  async getBundleRequestsByUser(userId: string): Promise<BundleRequest[]> {
    return await db.select().from(bundleRequests)
      .where(eq(bundleRequests.userId, userId))
      .orderBy(bundleRequests.createdAt);
  }

  async getBundleRequestsByAssignee(assigneeId: string): Promise<BundleRequest[]> {
    return await db.select().from(bundleRequests)
      .where(eq(bundleRequests.assigneeId, assigneeId))
      .orderBy(bundleRequests.createdAt);
  }

  async getBundleRequestsByStatus(status: string): Promise<BundleRequest[]> {
    return await db.select().from(bundleRequests)
      .where(eq(bundleRequests.status, status))
      .orderBy(bundleRequests.createdAt);
  }

  async createBundleRequest(request: InsertBundleRequest): Promise<BundleRequest> {
    const result = await db.insert(bundleRequests).values(request).returning();
    return result[0];
  }

  async updateBundleRequest(id: string, request: UpdateBundleRequest): Promise<BundleRequest | undefined> {
    const result = await db.update(bundleRequests)
      .set({ ...request, updatedAt: new Date() })
      .where(eq(bundleRequests.id, id))
      .returning();
    return result[0];
  }

  async assignBundleDesigner(requestId: string, assigneeId: string): Promise<BundleRequest | undefined> {
    const result = await db.update(bundleRequests)
      .set({ assigneeId, assignedAt: new Date(), status: "in-progress", updatedAt: new Date() })
      .where(eq(bundleRequests.id, requestId))
      .returning();
    return result[0];
  }

  async assignBundleVendor(requestId: string, vendorId: string): Promise<BundleRequest | undefined> {
    const result = await db.update(bundleRequests)
      .set({ 
        vendorAssigneeId: vendorId,
        vendorAssignedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(bundleRequests.id, requestId))
      .returning();
    return result[0];
  }

  async deliverBundleRequest(requestId: string, deliveredBy: string, finalStoreUrl?: string): Promise<BundleRequest | undefined> {
    // If finalStoreUrl is provided, merge it into formData
    let updateData: Record<string, any> = {
      status: "delivered",
      deliveredAt: new Date(),
      deliveredBy,
      updatedAt: new Date()
    };

    if (finalStoreUrl) {
      // Get existing formData and merge with new final_store_url
      const existing = await this.getBundleRequest(requestId);
      const existingFormData = (existing?.formData as Record<string, any>) || {};
      updateData.formData = { ...existingFormData, final_store_url: finalStoreUrl };
    }

    const result = await db.update(bundleRequests)
      .set(updateData)
      .where(eq(bundleRequests.id, requestId))
      .returning();
    return result[0];
  }

  async requestBundleChange(requestId: string, changeNote: string): Promise<BundleRequest | undefined> {
    const result = await db.update(bundleRequests)
      .set({
        status: "change-request",
        changeRequestNote: changeNote,
        updatedAt: new Date()
      })
      .where(eq(bundleRequests.id, requestId))
      .returning();
    return result[0];
  }

  // Bundle Request Attachment methods
  async getBundleRequestAttachments(requestId: string): Promise<BundleRequestAttachment[]> {
    return await db.select().from(bundleRequestAttachments)
      .where(eq(bundleRequestAttachments.requestId, requestId))
      .orderBy(bundleRequestAttachments.uploadedAt);
  }

  async createBundleRequestAttachment(attachment: InsertBundleRequestAttachment): Promise<BundleRequestAttachment> {
    const result = await db.insert(bundleRequestAttachments).values(attachment).returning();
    return result[0];
  }

  // Bundle Request Comment methods
  async getBundleRequestComments(requestId: string): Promise<BundleRequestComment[]> {
    return await db.select().from(bundleRequestComments)
      .where(eq(bundleRequestComments.requestId, requestId))
      .orderBy(bundleRequestComments.createdAt);
  }

  async createBundleRequestComment(comment: InsertBundleRequestComment): Promise<BundleRequestComment> {
    const result = await db.insert(bundleRequestComments).values(comment).returning();
    return result[0];
  }

  // Vendor Service Capacity methods
  async getVendorServiceCapacities(vendorProfileId: string): Promise<VendorServiceCapacity[]> {
    return await db.select().from(vendorServiceCapacities)
      .where(eq(vendorServiceCapacities.vendorProfileId, vendorProfileId))
      .orderBy(vendorServiceCapacities.createdAt);
  }

  async getVendorServiceCapacity(vendorProfileId: string, serviceId: string): Promise<VendorServiceCapacity | undefined> {
    const result = await db.select().from(vendorServiceCapacities)
      .where(and(
        eq(vendorServiceCapacities.vendorProfileId, vendorProfileId),
        eq(vendorServiceCapacities.serviceId, serviceId)
      ))
      .limit(1);
    return result[0];
  }

  async getAllVendorServiceCapacities(): Promise<VendorServiceCapacity[]> {
    return await db.select().from(vendorServiceCapacities).orderBy(vendorServiceCapacities.createdAt);
  }

  async createVendorServiceCapacity(data: InsertVendorServiceCapacity): Promise<VendorServiceCapacity> {
    const result = await db.insert(vendorServiceCapacities).values(data).returning();
    return result[0];
  }

  async updateVendorServiceCapacity(id: string, data: UpdateVendorServiceCapacity): Promise<VendorServiceCapacity | undefined> {
    const result = await db.update(vendorServiceCapacities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(vendorServiceCapacities.id, id))
      .returning();
    return result[0];
  }

  async getVendorServiceCapacityById(id: string): Promise<VendorServiceCapacity | undefined> {
    const result = await db.select().from(vendorServiceCapacities)
      .where(eq(vendorServiceCapacities.id, id))
      .limit(1);
    return result[0];
  }

  async deleteVendorServiceCapacity(id: string): Promise<void> {
    await db.delete(vendorServiceCapacities).where(eq(vendorServiceCapacities.id, id));
  }

  async upsertVendorServiceCapacity(data: InsertVendorServiceCapacity): Promise<VendorServiceCapacity> {
    const existing = await this.getVendorServiceCapacity(data.vendorProfileId, data.serviceId);
    if (existing) {
      // Only update mutable fields, not the composite key columns
      const { vendorProfileId, serviceId, ...mutableFields } = data;
      const result = await this.updateVendorServiceCapacity(existing.id, mutableFields);
      return result!;
    }
    return await this.createVendorServiceCapacity(data);
  }

  // Vendor Designer Capacity methods
  async getVendorDesignerCapacities(userId: string): Promise<VendorDesignerCapacity[]> {
    return await db.select().from(vendorDesignerCapacities)
      .where(eq(vendorDesignerCapacities.userId, userId))
      .orderBy(vendorDesignerCapacities.createdAt);
  }

  async getVendorDesignerCapacity(userId: string, serviceId: string): Promise<VendorDesignerCapacity | undefined> {
    const result = await db.select().from(vendorDesignerCapacities)
      .where(and(
        eq(vendorDesignerCapacities.userId, userId),
        eq(vendorDesignerCapacities.serviceId, serviceId)
      ))
      .limit(1);
    return result[0];
  }

  async getAllVendorDesignerCapacities(): Promise<VendorDesignerCapacity[]> {
    return await db.select().from(vendorDesignerCapacities).orderBy(vendorDesignerCapacities.createdAt);
  }

  async createVendorDesignerCapacity(data: InsertVendorDesignerCapacity): Promise<VendorDesignerCapacity> {
    const result = await db.insert(vendorDesignerCapacities).values(data).returning();
    return result[0];
  }

  async updateVendorDesignerCapacity(id: string, data: UpdateVendorDesignerCapacity): Promise<VendorDesignerCapacity | undefined> {
    const result = await db.update(vendorDesignerCapacities)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(vendorDesignerCapacities.id, id))
      .returning();
    return result[0];
  }

  async getVendorDesignerCapacityById(id: string): Promise<VendorDesignerCapacity | undefined> {
    const result = await db.select().from(vendorDesignerCapacities)
      .where(eq(vendorDesignerCapacities.id, id))
      .limit(1);
    return result[0];
  }

  async deleteVendorDesignerCapacity(id: string): Promise<void> {
    await db.delete(vendorDesignerCapacities).where(eq(vendorDesignerCapacities.id, id));
  }

  async upsertVendorDesignerCapacity(data: InsertVendorDesignerCapacity): Promise<VendorDesignerCapacity> {
    const existing = await this.getVendorDesignerCapacity(data.userId, data.serviceId);
    if (existing) {
      // Only update mutable fields, not the composite key columns
      const { userId, serviceId, ...mutableFields } = data;
      const result = await this.updateVendorDesignerCapacity(existing.id, mutableFields);
      return result!;
    }
    return await this.createVendorDesignerCapacity(data);
  }

  // Automation Rule methods
  async getAllAutomationRules(): Promise<AutomationRule[]> {
    return await db.select().from(automationRules).orderBy(desc(automationRules.priority));
  }

  async getAutomationRulesByScope(scope: string): Promise<AutomationRule[]> {
    return await db.select().from(automationRules)
      .where(eq(automationRules.scope, scope))
      .orderBy(desc(automationRules.priority));
  }

  async getAutomationRulesByOwner(ownerVendorId: string): Promise<AutomationRule[]> {
    return await db.select().from(automationRules)
      .where(eq(automationRules.ownerVendorId, ownerVendorId))
      .orderBy(desc(automationRules.priority));
  }

  async getAutomationRule(id: string): Promise<AutomationRule | undefined> {
    const result = await db.select().from(automationRules)
      .where(eq(automationRules.id, id))
      .limit(1);
    return result[0];
  }

  async createAutomationRule(data: InsertAutomationRule): Promise<AutomationRule> {
    const result = await db.insert(automationRules).values(data).returning();
    return result[0];
  }

  async updateAutomationRule(id: string, data: UpdateAutomationRule): Promise<AutomationRule | undefined> {
    const result = await db.update(automationRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(automationRules.id, id))
      .returning();
    return result[0];
  }

  async deleteAutomationRule(id: string): Promise<void> {
    await db.delete(automationRules).where(eq(automationRules.id, id));
  }

  // Automation Assignment Log methods
  async getAutomationLogsByRequest(requestId: string): Promise<AutomationAssignmentLog[]> {
    return await db.select().from(automationAssignmentLogs)
      .where(eq(automationAssignmentLogs.requestId, requestId))
      .orderBy(desc(automationAssignmentLogs.createdAt));
  }

  async createAutomationLog(data: InsertAutomationAssignmentLog): Promise<AutomationAssignmentLog> {
    const result = await db.insert(automationAssignmentLogs).values(data).returning();
    return result[0];
  }
}

export const storage = new DbStorage();
