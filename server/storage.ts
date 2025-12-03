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
  users,
  services,
  serviceRequests,
  serviceAttachments,
  comments,
} from "@shared/schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getUsersByRole(role: string): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;

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
}

export const storage = new DbStorage();
