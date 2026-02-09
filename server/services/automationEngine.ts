import { storage } from "../storage";
import type {
  ServiceRequest,
  AutomationRule,
  VendorServiceCapacity,
  VendorDesignerCapacity,
  VendorProfile,
  User,
  InsertAutomationAssignmentLog,
  AutoAssignmentStatus,
  RoutingStrategy,
} from "@shared/schema";

const TRIPOD_INTERNAL_VENDOR_PROFILE_ID = "tripod-internal-vendor-profile-001";

function hasValidServiceCost(vendorProfile: VendorProfile, serviceTitle: string): boolean {
  if (vendorProfile.id === TRIPOD_INTERNAL_VENDOR_PROFILE_ID) return true;
  if (!vendorProfile.pricingAgreements) return false;
  const agreements = vendorProfile.pricingAgreements as Record<string, any>;
  const sa = agreements[serviceTitle];
  if (!sa) return false;
  if (sa.basePrice !== undefined) return parseFloat(String(sa.basePrice)) > 0;
  if (sa.complexity) return Object.values(sa.complexity).some((v: any) => parseFloat(String(v)) > 0);
  if (sa.quantity) return Object.values(sa.quantity).some((v: any) => parseFloat(String(v)) > 0);
  return false;
}

interface AutomationResult {
  success: boolean;
  status: AutoAssignmentStatus;
  vendorAssigneeId?: string;
  designerAssigneeId?: string;
  note: string;
  logs: InsertAutomationAssignmentLog[];
}

interface VendorCandidate {
  vendorProfile: VendorProfile;
  capacity: VendorServiceCapacity;
  currentLoad: number;
  availableCapacity: number;
}

interface DesignerCandidate {
  user: User;
  capacity: VendorDesignerCapacity;
  currentLoad: number;
  availableCapacity: number;
}

interface CapacitySnapshot {
  vendorProfileId?: string;
  userId?: string;
  dailyCapacity: number;
  currentLoad: number;
  availableCapacity: number;
}

export class AutomationEngine {
  private roundRobinVendorIndex: Map<string, number> = new Map();
  private roundRobinDesignerIndex: Map<string, number> = new Map();

  async processNewServiceRequest(request: ServiceRequest): Promise<AutomationResult> {
    const logs: InsertAutomationAssignmentLog[] = [];
    
    if (request.lockedAssignment) {
      return {
        success: false,
        status: "not_attempted",
        note: "Assignment is locked - skipping automation",
        logs,
      };
    }

    if (request.vendorAssigneeId || request.assigneeId) {
      return {
        success: false,
        status: "not_attempted", 
        note: "Request already has assignment - skipping automation",
        logs,
      };
    }

    const globalRules = await this.getActiveGlobalRules(request.serviceId);
    
    if (globalRules.length === 0) {
      logs.push({
        requestId: request.id,
        requestType: "service",
        step: "find_rules",
        result: "no_rules",
        reason: "No active global automation rules found for this service",
      });
      
      return {
        success: false,
        status: "not_attempted",
        note: "No active automation rules configured",
        logs,
      };
    }

    for (const rule of globalRules) {
      if (!this.matchesCriteria(request, rule)) {
        continue;
      }

      logs.push({
        requestId: request.id,
        requestType: "service",
        ruleId: rule.id,
        step: "rule_matched",
        result: "matched",
        reason: `Rule "${rule.name}" matched request criteria`,
      });

      const vendorResult = await this.selectVendor(request, rule, logs);
      
      if (!vendorResult) {
        continue;
      }

      let designerResult: DesignerCandidate | null = null;
      
      if (rule.routingTarget === "vendor_then_designer") {
        designerResult = await this.selectDesigner(
          request, 
          vendorResult.vendorProfile.userId, 
          rule,
          logs
        );
      }

      if (vendorResult && designerResult) {
        return {
          success: true,
          status: "assigned",
          vendorAssigneeId: vendorResult.vendorProfile.userId,
          designerAssigneeId: designerResult.user.id,
          note: `Auto-assigned to vendor ${vendorResult.vendorProfile.companyName || "Unknown"} and designer ${designerResult.user.username}`,
          logs,
        };
      } else if (vendorResult) {
        const status: AutoAssignmentStatus = rule.routingTarget === "vendor_then_designer" 
          ? "partial_assigned" 
          : "assigned";
        return {
          success: true,
          status,
          vendorAssigneeId: vendorResult.vendorProfile.userId,
          note: `Auto-assigned to vendor ${vendorResult.vendorProfile.companyName || "Unknown"}${status === "partial_assigned" ? " (no designer available)" : ""}`,
          logs,
        };
      }
    }

    return {
      success: false,
      status: "failed_no_vendor",
      note: "No vendors with available capacity found for this service",
      logs,
    };
  }

  private async getActiveGlobalRules(serviceId: string): Promise<AutomationRule[]> {
    const allRules = await storage.getAutomationRulesByScope("global");
    
    return allRules
      .filter(rule => rule.isActive)
      .filter(rule => {
        if (!rule.serviceIds) return true;
        const serviceIds = rule.serviceIds as string[];
        return serviceIds.length === 0 || serviceIds.includes(serviceId);
      })
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  private matchesCriteria(request: ServiceRequest, rule: AutomationRule): boolean {
    if (!rule.matchCriteria) return true;
    
    const criteria = rule.matchCriteria as Record<string, unknown>;
    
    if (criteria.clientId && criteria.clientId !== request.userId) {
      return false;
    }
    
    return true;
  }

  private async selectVendor(
    request: ServiceRequest, 
    rule: AutomationRule,
    logs: InsertAutomationAssignmentLog[]
  ): Promise<VendorCandidate | null> {
    const allCapacities = await storage.getAllVendorServiceCapacities();
    const serviceCapacities = allCapacities.filter(c => 
      c.serviceId === request.serviceId && 
      c.autoAssignEnabled
    );

    if (serviceCapacities.length === 0) {
      logs.push({
        requestId: request.id,
        requestType: "service",
        ruleId: rule.id,
        step: "vendor_selection",
        result: "no_candidates",
        reason: "No vendors have capacity configured for this service",
      });
      return null;
    }

    const allowedVendorIds = rule.allowedVendorIds as string[] | null;
    const excludedVendorIds = rule.excludedVendorIds as string[] | null;

    const candidates: VendorCandidate[] = [];
    const allProfiles = await storage.getAllVendorProfiles();
    const profileMap = new Map(allProfiles.map(p => [p.id, p]));

    const service = request.serviceId ? await storage.getService(request.serviceId) : null;
    const serviceTitle = service?.title;

    for (const capacity of serviceCapacities) {
      const profile = profileMap.get(capacity.vendorProfileId);
      if (!profile) continue;

      if (allowedVendorIds && allowedVendorIds.length > 0) {
        if (!allowedVendorIds.includes(profile.userId)) continue;
      }
      if (excludedVendorIds && excludedVendorIds.length > 0) {
        if (excludedVendorIds.includes(profile.userId)) continue;
      }

      if (serviceTitle && !hasValidServiceCost(profile, serviceTitle)) continue;
      if (!serviceTitle && profile.id !== TRIPOD_INTERNAL_VENDOR_PROFILE_ID) continue;

      const currentLoad = await this.getVendorDailyLoad(profile.userId, request.serviceId);
      const availableCapacity = capacity.dailyCapacity - currentLoad;

      if (availableCapacity > 0) {
        candidates.push({
          vendorProfile: profile,
          capacity,
          currentLoad,
          availableCapacity,
        });
      }
    }

    if (candidates.length === 0) {
      logs.push({
        requestId: request.id,
        requestType: "service",
        ruleId: rule.id,
        step: "vendor_selection",
        result: "no_capacity",
        reason: "All eligible vendors are at capacity",
        candidatesConsidered: serviceCapacities.map(c => c.vendorProfileId),
      });
      return null;
    }

    const strategy = (rule.routingStrategy || "least_loaded") as RoutingStrategy;
    const selected = this.applyVendorRoutingStrategy(candidates, strategy, request.serviceId);

    logs.push({
      requestId: request.id,
      requestType: "service",
      ruleId: rule.id,
      step: "vendor_selection",
      result: "selected",
      reason: `Selected vendor using ${strategy} strategy`,
      chosenId: selected.vendorProfile.userId,
      candidatesConsidered: candidates.map(c => c.vendorProfile.userId),
      capacitySnapshot: candidates.map(c => ({
        vendorProfileId: c.vendorProfile.id,
        dailyCapacity: c.capacity.dailyCapacity,
        currentLoad: c.currentLoad,
        availableCapacity: c.availableCapacity,
      })) as unknown as Record<string, unknown>,
    });

    return selected;
  }

  private async selectDesigner(
    request: ServiceRequest,
    vendorUserId: string,
    rule: AutomationRule,
    logs: InsertAutomationAssignmentLog[]
  ): Promise<DesignerCandidate | null> {
    const allUsers = await storage.getAllUsers();
    const vendorDesigners = allUsers.filter(u => 
      u.role === "vendor_designer" && 
      u.vendorId === vendorUserId &&
      u.isActive
    );

    if (vendorDesigners.length === 0) {
      logs.push({
        requestId: request.id,
        requestType: "service",
        ruleId: rule.id,
        step: "designer_selection",
        result: "no_candidates",
        reason: "No active designers found for this vendor",
      });
      return null;
    }

    const candidates: DesignerCandidate[] = [];

    for (const designer of vendorDesigners) {
      const capacity = await storage.getVendorDesignerCapacity(designer.id, request.serviceId);
      
      if (!capacity || !capacity.autoAssignEnabled) continue;

      const currentLoad = await this.getDesignerDailyLoad(designer.id, request.serviceId);
      const availableCapacity = capacity.dailyCapacity - currentLoad;

      if (availableCapacity > 0) {
        candidates.push({
          user: designer,
          capacity,
          currentLoad,
          availableCapacity,
        });
      }
    }

    if (candidates.length === 0) {
      logs.push({
        requestId: request.id,
        requestType: "service",
        ruleId: rule.id,
        step: "designer_selection",
        result: "no_capacity",
        reason: "All eligible designers are at capacity or not configured for this service",
        candidatesConsidered: vendorDesigners.map(d => d.id),
      });
      return null;
    }

    candidates.sort((a, b) => {
      if (a.capacity.isPrimary !== b.capacity.isPrimary) {
        return a.capacity.isPrimary ? -1 : 1;
      }
      return (b.capacity.priority || 0) - (a.capacity.priority || 0);
    });

    const strategy = (rule.routingStrategy || "least_loaded") as RoutingStrategy;
    const selected = this.applyDesignerRoutingStrategy(candidates, strategy, vendorUserId);

    logs.push({
      requestId: request.id,
      requestType: "service",
      ruleId: rule.id,
      step: "designer_selection",
      result: "selected",
      reason: `Selected designer using ${strategy} strategy`,
      chosenId: selected.user.id,
      candidatesConsidered: candidates.map(c => c.user.id),
      capacitySnapshot: candidates.map(c => ({
        userId: c.user.id,
        dailyCapacity: c.capacity.dailyCapacity,
        currentLoad: c.currentLoad,
        availableCapacity: c.availableCapacity,
      })) as unknown as Record<string, unknown>,
    });

    return selected;
  }

  private applyVendorRoutingStrategy(
    candidates: VendorCandidate[],
    strategy: RoutingStrategy,
    serviceId: string
  ): VendorCandidate {
    switch (strategy) {
      case "least_loaded":
        return candidates.reduce((best, current) => 
          current.currentLoad < best.currentLoad ? current : best
        );

      case "round_robin": {
        const key = `vendor_${serviceId}`;
        // Initialize with -1 so first increment gives index 0
        const lastIndex = this.roundRobinVendorIndex.has(key) 
          ? this.roundRobinVendorIndex.get(key)! 
          : -1;
        const nextIndex = (lastIndex + 1) % candidates.length;
        this.roundRobinVendorIndex.set(key, nextIndex);
        return candidates[nextIndex];
      }

      case "priority_first":
        return candidates.reduce((best, current) => 
          (current.capacity.priority || 0) > (best.capacity.priority || 0) ? current : best
        );

      default:
        return candidates[0];
    }
  }

  private applyDesignerRoutingStrategy(
    candidates: DesignerCandidate[],
    strategy: RoutingStrategy,
    vendorUserId: string
  ): DesignerCandidate {
    switch (strategy) {
      case "least_loaded":
        return candidates.reduce((best, current) => 
          current.currentLoad < best.currentLoad ? current : best
        );

      case "round_robin": {
        const key = `designer_${vendorUserId}`;
        // Initialize with -1 so first increment gives index 0
        const lastIndex = this.roundRobinDesignerIndex.has(key) 
          ? this.roundRobinDesignerIndex.get(key)! 
          : -1;
        const nextIndex = (lastIndex + 1) % candidates.length;
        this.roundRobinDesignerIndex.set(key, nextIndex);
        return candidates[nextIndex];
      }

      case "priority_first":
        return candidates.reduce((best, current) => 
          (current.capacity.priority || 0) > (best.capacity.priority || 0) ? current : best
        );

      default:
        return candidates[0];
    }
  }

  private async getVendorDailyLoad(vendorUserId: string, serviceId: string): Promise<number> {
    const allRequests = await storage.getAllServiceRequests();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return allRequests.filter(req => {
      if (req.vendorAssigneeId !== vendorUserId) return false;
      if (req.serviceId !== serviceId) return false;
      if (!req.vendorAssignedAt) return false;
      const assignedDate = new Date(req.vendorAssignedAt);
      assignedDate.setHours(0, 0, 0, 0);
      return assignedDate.getTime() === today.getTime();
    }).length;
  }

  private async getDesignerDailyLoad(designerId: string, serviceId: string): Promise<number> {
    const allRequests = await storage.getAllServiceRequests();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return allRequests.filter(req => {
      if (req.assigneeId !== designerId) return false;
      if (req.serviceId !== serviceId) return false;
      if (!req.assignedAt) return false;
      const assignedDate = new Date(req.assignedAt);
      assignedDate.setHours(0, 0, 0, 0);
      return assignedDate.getTime() === today.getTime();
    }).length;
  }

  async applyAutomationResult(
    requestId: string, 
    result: AutomationResult
  ): Promise<ServiceRequest | undefined> {
    for (const log of result.logs) {
      await storage.createAutomationLog(log);
    }

    const updateData: Record<string, unknown> = {
      autoAssignmentStatus: result.status,
      lastAutomationRunAt: new Date(),
      lastAutomationNote: result.note,
    };

    if (result.vendorAssigneeId) {
      updateData.vendorAssigneeId = result.vendorAssigneeId;
      updateData.vendorAssignedAt = new Date();
    }

    if (result.designerAssigneeId) {
      updateData.assigneeId = result.designerAssigneeId;
      updateData.assignedAt = new Date();
      updateData.status = "in-progress";
    }

    return await storage.updateServiceRequest(requestId, updateData);
  }
}

export const automationEngine = new AutomationEngine();
