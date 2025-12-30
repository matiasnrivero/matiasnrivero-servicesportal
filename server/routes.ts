import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { automationEngine } from "./services/automationEngine";
import type { User } from "@shared/schema";

/**
 * Role-based assignment permissions:
 * - Admin → can assign to Vendor, Internal Designer, Vendor Designer
 * - Internal Designer → can assign to Vendor, Vendor Designer, other Internal Designers
 * - Vendor → can assign to Vendor Designer, other Vendors (same Vendor Profile)
 * - Vendor Designer → can assign to other Vendor Designers
 */
function getAssignableRoles(assignerRole: string): string[] {
  switch (assignerRole) {
    case "admin":
      return ["vendor", "internal_designer", "vendor_designer"];
    case "internal_designer":
      return ["vendor", "vendor_designer", "internal_designer"];
    case "vendor":
      return ["vendor_designer", "vendor"];
    case "vendor_designer":
      return ["vendor_designer"];
    default:
      return [];
  }
}

/**
 * Check if assigner can assign to target user based on role permissions
 * Also handles vendor profile restrictions for vendor/vendor_designer roles
 */
async function canAssignTo(assigner: User, target: User): Promise<{ allowed: boolean; reason?: string }> {
  const assignableRoles = getAssignableRoles(assigner.role);
  
  // Check if target role is in the list of assignable roles
  if (!assignableRoles.includes(target.role)) {
    return { 
      allowed: false, 
      reason: `${assigner.role} cannot assign to ${target.role}` 
    };
  }
  
  // Admin can assign to anyone in their assignable roles without restriction
  if (assigner.role === "admin") {
    return { allowed: true };
  }
  
  // Internal Designer can assign to anyone in their assignable roles without vendor profile restriction
  // EXCEPT vendor_designer - must respect vendor profile isolation for security
  if (assigner.role === "internal_designer") {
    // Internal designers can assign to vendors and other internal designers freely
    if (target.role === "vendor" || target.role === "internal_designer") {
      return { allowed: true };
    }
    // For vendor_designer targets, internal designers can still assign them
    // but this is an elevated permission - they can cross vendor profiles
    return { allowed: true };
  }
  
  // Special case: Vendor can only assign to users in the same Vendor Profile
  if (assigner.role === "vendor" && target.role === "vendor") {
    // Both are vendors - they must belong to the same vendor profile
    const assignerVendorId = assigner.vendorId || assigner.id;
    const targetVendorId = target.vendorId || target.id;
    if (assignerVendorId !== targetVendorId) {
      return { 
        allowed: false, 
        reason: "Vendors can only assign to other vendors in the same vendor profile" 
      };
    }
  }
  
  // Special case: Vendor assigning to vendor_designer must be in same vendor profile
  if (assigner.role === "vendor" && target.role === "vendor_designer") {
    const assignerVendorId = assigner.vendorId || assigner.id;
    if (target.vendorId !== assignerVendorId) {
      return { 
        allowed: false, 
        reason: "Vendors can only assign to vendor designers in their own profile" 
      };
    }
  }
  
  // Special case: Vendor Designer can only assign to other Vendor Designers in same vendor profile
  if (assigner.role === "vendor_designer" && target.role === "vendor_designer") {
    if (assigner.vendorId !== target.vendorId) {
      return { 
        allowed: false, 
        reason: "Vendor designers can only assign to other vendor designers in the same profile" 
      };
    }
  }
  
  return { allowed: true };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Users routes
  app.get("/api/users", async (req, res) => {
    try {
      const { role } = req.query;
      let users;
      if (role) {
        users = await storage.getUsersByRole(role as string);
      } else {
        users = await storage.getAllUsers();
      }
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Get users that the current session user can assign work to
  // Returns filtered list based on role-based assignment permissions
  // Note: Internal designers can assign vendor_designers across any vendor profile (elevated permission)
  // Vendors/vendor_designers are restricted to their own vendor profile only
  app.get("/api/assignable-users", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Get roles this user can assign to
      const assignableRoles = getAssignableRoles(sessionUser.role);
      if (assignableRoles.length === 0) {
        return res.json([]);
      }

      // Get all users and filter by assignable roles
      const allUsers = await storage.getAllUsers();
      const assignableUsers: User[] = [];
      
      // For vendor/vendor_designer callers, pre-filter by vendor profile for efficiency
      // This ensures they only see users in their own vendor profile
      const callerVendorId = sessionUser.vendorId || (sessionUser.role === "vendor" ? sessionUser.id : null);
      const isVendorCaller = sessionUser.role === "vendor" || sessionUser.role === "vendor_designer";

      for (const user of allUsers) {
        // Skip inactive users
        if (!user.isActive) continue;
        
        // Early filter: For vendor/vendor_designer callers, only consider same-profile users
        if (isVendorCaller && callerVendorId) {
          const userVendorId = user.vendorId || (user.role === "vendor" ? user.id : null);
          if (userVendorId !== callerVendorId) {
            continue; // Skip users outside caller's vendor profile
          }
        }
        
        // Check if this user can be assigned by the session user
        const check = await canAssignTo(sessionUser, user);
        if (check.allowed) {
          assignableUsers.push(user);
        }
      }

      res.json(assignableUsers);
    } catch (error) {
      console.error("Error fetching assignable users:", error);
      res.status(500).json({ error: "Failed to fetch assignable users" });
    }
  });

  // Services routes
  app.get("/api/services", async (req, res) => {
    try {
      const { excludeSons } = req.query;
      let services;
      // Default: exclude son services (excludeSons defaults to true)
      // Only include son services if explicitly set to "false"
      if (excludeSons === "false") {
        services = await storage.getAllServices();
      } else {
        // Default behavior: only show father services (excludeSons=true or not specified)
        services = await storage.getFatherServices();
      }
      res.json(services);
    } catch (error) {
      console.error("Error fetching services:", error);
      res.status(500).json({ error: "Failed to fetch services", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Get child services for a parent service
  app.get("/api/services/:id/children", async (req, res) => {
    try {
      const children = await storage.getChildServices(req.params.id);
      res.json(children);
    } catch (error) {
      console.error("Error fetching child services:", error);
      res.status(500).json({ error: "Failed to fetch child services" });
    }
  });

  app.get("/api/services/:id", async (req, res) => {
    try {
      const service = await storage.getService(req.params.id);
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }
      res.json(service);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch service" });
    }
  });

  app.post("/api/services", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const service = await storage.createService(req.body);
      res.status(201).json(service);
    } catch (error) {
      console.error("Error creating service:", error);
      res.status(500).json({ error: "Failed to create service" });
    }
  });

  app.patch("/api/services/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const service = await storage.updateService(req.params.id, req.body);
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }
      res.json(service);
    } catch (error) {
      console.error("Error updating service:", error);
      res.status(500).json({ error: "Failed to update service" });
    }
  });

  app.delete("/api/services/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      await storage.deleteService(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting service:", error);
      res.status(500).json({ error: "Failed to delete service" });
    }
  });

  // Public endpoint to get service form fields (with input field details joined)
  app.get("/api/services/:serviceId/form-fields", async (req, res) => {
    try {
      const serviceFields = await storage.getServiceFields(req.params.serviceId);
      // Join with input field details
      const fieldsWithDetails = await Promise.all(serviceFields.map(async (sf) => {
        const inputField = await storage.getInputField(sf.inputFieldId);
        // Parse optionsJson if it's a string
        let parsedOptionsJson = sf.optionsJson;
        if (typeof sf.optionsJson === 'string' && sf.optionsJson) {
          try {
            parsedOptionsJson = JSON.parse(sf.optionsJson);
          } catch (e) {
            // If it's comma-separated, split it
            parsedOptionsJson = sf.optionsJson.split(',').map((s: string) => s.trim()).filter(Boolean);
          }
        }
        return {
          ...sf,
          optionsJson: parsedOptionsJson,
          inputField: inputField || null,
        };
      }));
      // Filter out inactive fields and sort by sortOrder
      const activeFields = fieldsWithDetails
        .filter(f => f.isActive && f.inputField?.isActive)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      res.json(activeFields);
    } catch (error) {
      console.error("Error fetching service form fields:", error);
      res.status(500).json({ error: "Failed to fetch form fields" });
    }
  });

  // Service pricing tiers routes
  app.get("/api/services/:serviceId/tiers", async (req, res) => {
    try {
      const tiers = await storage.getServicePricingTiers(req.params.serviceId);
      res.json(tiers);
    } catch (error) {
      console.error("Error fetching service pricing tiers:", error);
      res.status(500).json({ error: "Failed to fetch pricing tiers" });
    }
  });

  app.post("/api/services/:serviceId/tiers", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const tier = await storage.createServicePricingTier({ ...req.body, serviceId: req.params.serviceId });
      res.status(201).json(tier);
    } catch (error) {
      console.error("Error creating pricing tier:", error);
      res.status(500).json({ error: "Failed to create pricing tier" });
    }
  });

  app.patch("/api/service-tiers/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const tier = await storage.updateServicePricingTier(req.params.id, req.body);
      if (!tier) {
        return res.status(404).json({ error: "Pricing tier not found" });
      }
      res.json(tier);
    } catch (error) {
      console.error("Error updating pricing tier:", error);
      res.status(500).json({ error: "Failed to update pricing tier" });
    }
  });

  app.delete("/api/service-tiers/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      await storage.deleteServicePricingTier(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting pricing tier:", error);
      res.status(500).json({ error: "Failed to delete pricing tier" });
    }
  });

  // Bulk update pricing tiers for a service
  app.put("/api/services/:serviceId/tiers", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const { tiers } = req.body;
      // Delete existing tiers and create new ones
      await storage.deleteServicePricingTiersByService(req.params.serviceId);
      const createdTiers = [];
      for (let i = 0; i < tiers.length; i++) {
        const tier = await storage.createServicePricingTier({
          serviceId: req.params.serviceId,
          label: tiers[i].label,
          price: tiers[i].price,
          sortOrder: i,
        });
        createdTiers.push(tier);
      }
      res.json(createdTiers);
    } catch (error) {
      console.error("Error updating pricing tiers:", error);
      res.status(500).json({ error: "Failed to update pricing tiers" });
    }
  });

  // Service requests routes - filtered by session user's role
  app.get("/api/service-requests", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      const { status } = req.query;
      let requests: any[] = [];

      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Filter requests based on user's role hierarchy
      // admin, internal_designer can see all requests
      // vendor, vendor_designer see jobs assigned to their vendor organization
      // client can only see their own requests
      if (sessionUser.role === "client") {
        // Clients can only see their own requests
        requests = await storage.getServiceRequestsByUser(sessionUserId);
      } else if (["admin", "internal_designer", "designer"].includes(sessionUser.role)) {
        // Admin, Internal Designers can see all requests
        if (status) {
          requests = await storage.getServiceRequestsByStatus(status as string);
        } else {
          requests = await storage.getAllServiceRequests();
        }
      } else if (["vendor", "vendor_designer"].includes(sessionUser.role)) {
        // Vendors and Vendor Designers see jobs assigned to their vendor organization
        const vendorId = sessionUser.role === "vendor" ? sessionUser.id : sessionUser.vendorId;
        if (vendorId) {
          const allRequests = status 
            ? await storage.getServiceRequestsByStatus(status as string)
            : await storage.getAllServiceRequests();
          
          // Prefetch all users to avoid N+1 queries
          const allUsers = await storage.getAllUsers();
          const userMap = new Map(allUsers.map(u => [u.id, u]));
          
          // Filter to show jobs assigned to this vendor organization:
          // 1. vendorAssigneeId matches the vendor
          // 2. assigneeId is the current user
          // 3. assigneeId is a vendor_designer belonging to this vendor
          requests = allRequests.filter(r => {
            if (r.vendorAssigneeId === vendorId) return true;
            if (r.assigneeId === sessionUserId) return true;
            if (r.assigneeId) {
              const assignee = userMap.get(r.assigneeId);
              if (assignee?.vendorId === vendorId) return true;
            }
            return false;
          });
        } else {
          requests = [];
        }
      } else {
        requests = [];
      }

      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch service requests" });
    }
  });

  app.get("/api/service-requests/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const request = await storage.getServiceRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Clients can only view their own requests
      if (sessionUser.role === "client" && request.userId !== sessionUserId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Admin, Internal Designers, Vendors, Vendor Designers can view all requests
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch service request" });
    }
  });

  app.post("/api/service-requests", async (req, res) => {
    try {
      // Use session user for the request
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Get session user to check role for assigneeId permission
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      console.log("Creating service request with data:", req.body);
      const requestData = {
        ...req.body,
        userId: sessionUserId, // Use session user instead of client-provided
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
        autoAssignmentStatus: "not_attempted" as const,
      };

      // Only admin and internal_designer can set assigneeId during creation
      const hasManualAssignment = ["admin", "internal_designer"].includes(sessionUser.role) && 
        (req.body.assigneeId || req.body.vendorAssigneeId);
      
      if (!["admin", "internal_designer"].includes(sessionUser.role)) {
        delete requestData.assigneeId;
        delete requestData.vendorAssigneeId;
      }

      let request = await storage.createServiceRequest(requestData);

      // Trigger auto-assignment if no manual assignment was provided
      if (!hasManualAssignment && !request.assigneeId && !request.vendorAssigneeId) {
        try {
          const automationResult = await automationEngine.processNewServiceRequest(request);
          if (automationResult.success || automationResult.logs.length > 0) {
            const updatedRequest = await automationEngine.applyAutomationResult(request.id, automationResult);
            if (updatedRequest) {
              request = updatedRequest;
            }
          }
        } catch (automationError) {
          console.error("Automation engine error:", automationError);
          // Continue with the original request - automation failure shouldn't block creation
        }
      }

      res.status(201).json(request);
    } catch (error) {
      console.error("Error creating service request:", error);
      res.status(500).json({ error: "Failed to create service request", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // PATCH endpoint restricted - status changes must go through specific endpoints
  // This endpoint is only for non-sensitive updates by the original requester
  app.patch("/api/service-requests/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Only the original requester can update their request
      if (existingRequest.userId !== sessionUserId) {
        return res.status(403).json({ error: "Only the original requester can update this request" });
      }

      // Only allow updates on pending requests (before work starts)
      if (existingRequest.status !== "pending") {
        return res.status(400).json({ error: "Can only update pending requests" });
      }

      // Remove any privileged fields from the update
      const allowedFields = ["notes", "requirements", "customerName", "dueDate", "orderNumber"];
      const sanitizedUpdate: Record<string, any> = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          sanitizedUpdate[field] = field === "dueDate" && req.body[field] 
            ? new Date(req.body[field]) 
            : req.body[field];
        }
      }

      const request = await storage.updateServiceRequest(req.params.id, sanitizedUpdate);
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to update service request" });
    }
  });

  // Assign designer to request with role-based permissions
  // Admin → Vendor, Internal Designer, Vendor Designer
  // Internal Designer → Vendor, Vendor Designer, other Internal Designers
  // Vendor → Vendor Designer, other Vendors (same Vendor Profile)
  // Vendor Designer → other Vendor Designers (same profile)
  app.post("/api/service-requests/:id/assign", async (req, res) => {
    try {
      // Use session user for authorization
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Verify the session user can manage jobs
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Check if user has a role that can assign at all
      const canManageJobs = ["admin", "internal_designer", "vendor", "vendor_designer"].includes(sessionUser.role);
      if (!canManageJobs) {
        return res.status(403).json({ error: "You don't have permission to assign jobs" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Only allow assignment if status is pending or in-progress (reassignment)
      if (existingRequest.status !== "pending" && existingRequest.status !== "in-progress") {
        return res.status(400).json({ error: "Can only assign designers to pending or in-progress requests" });
      }

      // Get the target designer ID
      // If not provided, default to session user (self-assignment / "Take Job")
      const targetDesignerId = req.body.designerId || sessionUserId;
      
      // Ensure we have a valid target ID
      if (!targetDesignerId) {
        return res.status(400).json({ error: "designerId is required" });
      }

      // Verify target designer exists
      const targetDesigner = await storage.getUser(targetDesignerId);
      if (!targetDesigner) {
        return res.status(404).json({ error: "Target designer not found" });
      }
      
      // Check role-based assignment permissions (including self-assignment)
      const assignmentCheck = await canAssignTo(sessionUser, targetDesigner);
      if (!assignmentCheck.allowed) {
        return res.status(403).json({ error: assignmentCheck.reason || "You cannot assign to this user" });
      }

      // Assign the target designer
      const request = await storage.assignDesigner(req.params.id, targetDesignerId);
      res.json(request);
    } catch (error) {
      console.error("Error assigning designer:", error);
      res.status(500).json({ error: "Failed to assign designer" });
    }
  });

  // Assign request to vendor (without specific designer - keeps status as pending)
  app.post("/api/service-requests/:id/assign-vendor", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Only admin and internal_designer can assign to vendors
      if (!["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Only admins and internal designers can assign jobs to vendors" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Only allow vendor assignment when status is pending
      if (existingRequest.status !== "pending") {
        return res.status(400).json({ error: "Can only assign vendors to pending requests" });
      }

      const { vendorId } = req.body;
      if (!vendorId) {
        return res.status(400).json({ error: "vendorId is required" });
      }

      // Verify target vendor exists and is a vendor role
      const targetVendor = await storage.getUser(vendorId);
      if (!targetVendor) {
        return res.status(404).json({ error: "Vendor not found" });
      }
      if (targetVendor.role !== "vendor") {
        return res.status(400).json({ error: "Target user must be a vendor" });
      }

      // Assign to vendor (keeps status as pending, doesn't assign a specific designer)
      const request = await storage.assignVendor(req.params.id, vendorId);
      res.json(request);
    } catch (error) {
      console.error("Error assigning vendor:", error);
      res.status(500).json({ error: "Failed to assign vendor" });
    }
  });

  // Bulk assign multiple service requests
  app.post("/api/service-requests/bulk-assign", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const canManageJobs = ["admin", "internal_designer", "vendor", "vendor_designer"].includes(sessionUser.role);
      if (!canManageJobs) {
        return res.status(403).json({ error: "You don't have permission to assign jobs" });
      }

      const { requestIds, assignmentType, targetId } = req.body;
      
      if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
        return res.status(400).json({ error: "requestIds array is required" });
      }
      
      if (!assignmentType || !["designer", "vendor"].includes(assignmentType)) {
        return res.status(400).json({ error: "assignmentType must be 'designer' or 'vendor'" });
      }
      
      if (!targetId) {
        return res.status(400).json({ error: "targetId is required" });
      }

      // Vendor assignment is only for admin/internal_designer
      if (assignmentType === "vendor" && !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Only admins and internal designers can assign to vendors" });
      }

      // Verify target exists
      const target = await storage.getUser(targetId);
      if (!target) {
        return res.status(404).json({ error: "Target user not found" });
      }

      if (assignmentType === "vendor" && target.role !== "vendor") {
        return res.status(400).json({ error: "Target must be a vendor user" });
      }

      // Determine eligible status based on role
      // Admin/Internal Designer: "pending" status jobs that are either:
      //   - "Pending Assignment" (no assignee, no vendor) OR
      //   - "Assigned to Vendor" (has vendor, no designer assignee)
      // Vendor/Vendor Designer: only "pending" status (Pending - assigned to their vendor but no designer)
      const isAdminOrInternal = ["admin", "internal_designer"].includes(sessionUser.role);
      
      const results: { 
        assigned: string[]; 
        skipped: { id: string; reason: string }[] 
      } = { assigned: [], skipped: [] };

      for (const requestId of requestIds) {
        try {
          // Try to find as service request first, then as bundle request
          let request = await storage.getServiceRequest(requestId);
          let isBundle = false;
          
          if (!request) {
            // Try bundle request
            const bundleRequest = await storage.getBundleRequest(requestId);
            if (bundleRequest) {
              request = {
                id: bundleRequest.id,
                status: bundleRequest.status,
                assigneeId: bundleRequest.assigneeId,
                vendorAssigneeId: bundleRequest.vendorAssigneeId,
              } as any;
              isBundle = true;
            }
          }
          
          if (!request) {
            results.skipped.push({ id: requestId, reason: "Not found" });
            continue;
          }

          // Check status eligibility
          if (request.status !== "pending") {
            results.skipped.push({ id: requestId, reason: `Status is ${request.status}, not pending` });
            continue;
          }

          if (isAdminOrInternal) {
            // For admin/internal designer: can assign jobs in "Pending Assignment" or "Assigned to Vendor"
            // "Pending Assignment": no assignee AND no vendorAssigneeId
            // "Assigned to Vendor": has vendorAssigneeId but no designer assignee
            // Skip only if there's already a designer assigned (assigneeId points to a designer)
            if (request.assigneeId) {
              // Check if assignee is a designer (not the vendor)
              const assignee = await storage.getUser(request.assigneeId);
              if (assignee && assignee.role !== "vendor") {
                results.skipped.push({ id: requestId, reason: "Already assigned to a designer" });
                continue;
              }
            }
            // Allow both "Pending Assignment" (no vendor) and "Assigned to Vendor" (has vendor)
          } else {
            // For vendor/vendor_designer: only assign jobs in "Pending" 
            // (assigned to their vendor, no designer yet)
            // Verify the request is assigned to the vendor
            const vendorId = sessionUser.role === "vendor" ? sessionUser.id : sessionUser.vendorId;
            if (request.vendorAssigneeId !== vendorId) {
              results.skipped.push({ id: requestId, reason: "Not assigned to your organization" });
              continue;
            }
            if (request.assigneeId) {
              results.skipped.push({ id: requestId, reason: "Already assigned to a designer" });
              continue;
            }
          }

          // Check assignment permissions for designer assignment
          if (assignmentType === "designer") {
            const assignmentCheck = await canAssignTo(sessionUser, target);
            if (!assignmentCheck.allowed) {
              results.skipped.push({ id: requestId, reason: assignmentCheck.reason || "Cannot assign to this user" });
              continue;
            }
            if (isBundle) {
              await storage.assignBundleDesigner(requestId, targetId);
            } else {
              await storage.assignDesigner(requestId, targetId);
            }
          } else {
            // Vendor assignment
            if (isBundle) {
              await storage.assignBundleVendor(requestId, targetId);
            } else {
              await storage.assignVendor(requestId, targetId);
            }
          }

          results.assigned.push(requestId);
        } catch (err) {
          results.skipped.push({ id: requestId, reason: "Error processing" });
        }
      }

      res.json({
        success: true,
        assigned: results.assigned.length,
        skipped: results.skipped.length,
        details: results
      });
    } catch (error) {
      console.error("Error in bulk assign:", error);
      res.status(500).json({ error: "Failed to bulk assign" });
    }
  });

  // Mark request as delivered
  app.post("/api/service-requests/:id/deliver", async (req, res) => {
    try {
      const { finalStoreUrl, deliverableFiles } = req.body;
      
      // Use session user for authorization
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Verify the user can manage jobs
      const user = await storage.getUser(sessionUserId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      const canDeliver = ["admin", "internal_designer", "vendor", "vendor_designer", "designer"].includes(user.role);
      if (!canDeliver) {
        return res.status(403).json({ error: "You don't have permission to deliver requests" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      if (existingRequest.status !== "in-progress" && existingRequest.status !== "change-request") {
        return res.status(400).json({ error: "Request must be in-progress or change-request to deliver" });
      }

      // Verify the user is the assignee (admins can bypass this check)
      if (user.role !== "admin" && existingRequest.assigneeId !== sessionUserId) {
        return res.status(403).json({ error: "Only the assigned designer can deliver this request" });
      }

      // If finalStoreUrl is provided, save it to formData
      if (finalStoreUrl) {
        const currentFormData = existingRequest.formData as Record<string, unknown> || {};
        await storage.updateServiceRequest(req.params.id, {
          formData: { ...currentFormData, final_store_url: finalStoreUrl }
        });
      }

      // Create file delivery version record if there are file deliverables
      // Files can come from: a) deliverableFiles in request body, or b) recent deliverable attachments
      const allDeliverableAttachments = await storage.getAttachmentsByKind(req.params.id, "deliverable");
      
      // Get attachments that don't have a deliveryId yet (unversioned files)
      const unversionedAttachments = allDeliverableAttachments.filter(a => !a.deliveryId);
      
      // Combine with any files passed directly in the request
      const filesToDeliver: Array<{ url: string; fileName: string }> = [];
      
      // Add files from request body
      if (deliverableFiles && Array.isArray(deliverableFiles)) {
        filesToDeliver.push(...deliverableFiles);
      }
      
      // Add unversioned attachment files
      unversionedAttachments.forEach(attachment => {
        filesToDeliver.push({
          url: attachment.fileUrl,
          fileName: attachment.fileName
        });
      });

      // If there are files to deliver, create a delivery version record
      if (filesToDeliver.length > 0) {
        const latestVersion = await storage.getLatestDeliveryVersion(req.params.id);
        const newVersion = latestVersion + 1;
        
        const newDelivery = await storage.createDelivery({
          requestId: req.params.id,
          version: newVersion,
          deliveredBy: sessionUserId,
          files: filesToDeliver
        });

        // Link unversioned attachments to this delivery so they don't resurface in future versions
        const unversionedAttachmentIds = unversionedAttachments.map(a => a.id);
        await storage.linkAttachmentsToDelivery(unversionedAttachmentIds, newDelivery.id);
      }

      const request = await storage.deliverRequest(req.params.id, sessionUserId);
      res.json(request);
    } catch (error) {
      console.error("Error delivering request:", error);
      res.status(500).json({ error: "Failed to deliver request" });
    }
  });

  // Request changes
  app.post("/api/service-requests/:id/change-request", async (req, res) => {
    try {
      const { changeNote } = req.body;
      
      // Use session user for authorization
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      if (!changeNote || changeNote.trim() === "") {
        return res.status(400).json({ error: "changeNote is required for change requests" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      if (existingRequest.status !== "delivered") {
        return res.status(400).json({ error: "Request must be delivered to request changes" });
      }

      // Verify the session user is the original requester
      if (existingRequest.userId !== sessionUserId) {
        return res.status(403).json({ error: "Only the requester can request changes" });
      }

      const request = await storage.requestChange(req.params.id, changeNote);
      
      // Also add the change note as a comment with "[Change Request]" prefix
      await storage.createComment({
        requestId: req.params.id,
        authorId: sessionUserId,
        body: `[Change Request] ${changeNote}`,
        visibility: "public",
      });
      
      res.json(request);
    } catch (error) {
      console.error("Error requesting changes:", error);
      res.status(500).json({ error: "Failed to request changes" });
    }
  });

  // Resume work on request (after change request)
  app.post("/api/service-requests/:id/resume", async (req, res) => {
    try {
      // Use session user for authorization
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Verify the user can manage jobs
      const user = await storage.getUser(sessionUserId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      const canResume = ["admin", "internal_designer", "vendor", "vendor_designer", "designer"].includes(user.role);
      if (!canResume) {
        return res.status(403).json({ error: "You don't have permission to resume work" });
      }
      
      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      if (existingRequest.status !== "change-request") {
        return res.status(400).json({ error: "Request must have change-request status to resume" });
      }

      // Verify the session user is the assignee
      if (existingRequest.assigneeId !== sessionUserId) {
        return res.status(403).json({ error: "Only the assigned designer can resume this request" });
      }

      // Clear change request note when resuming
      const request = await storage.updateServiceRequest(req.params.id, { 
        status: "in-progress",
        changeRequestNote: null 
      });
      res.json(request);
    } catch (error) {
      console.error("Error resuming request:", error);
      res.status(500).json({ error: "Failed to resume request" });
    }
  });

  // Cancel request (only when pending)
  app.post("/api/service-requests/:id/cancel", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      if (existingRequest.status !== "pending") {
        return res.status(400).json({ error: "Only pending requests can be canceled" });
      }

      // Verify the session user is the original requester
      if (existingRequest.userId !== sessionUserId) {
        return res.status(403).json({ error: "Only the requester can cancel this request" });
      }

      const request = await storage.updateServiceRequest(req.params.id, { 
        status: "canceled"
      });
      res.json(request);
    } catch (error) {
      console.error("Error canceling request:", error);
      res.status(500).json({ error: "Failed to cancel request" });
    }
  });

  // Delete service request (admin only)
  app.delete("/api/service-requests/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      await storage.deleteServiceRequest(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting service request:", error);
      res.status(500).json({ error: "Failed to delete service request" });
    }
  });

  // Attachments routes - requires authentication and ownership/assignment check
  app.get("/api/service-requests/:requestId/attachments", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.requestId);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Clients/Distributors can only view attachments for their own requests
      if ((sessionUser.role === "client" || sessionUser.role === "distributor") && existingRequest.userId !== sessionUserId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Designers can view all attachments (they need access to work on jobs)
      const { kind } = req.query;
      let attachments;
      if (kind) {
        attachments = await storage.getAttachmentsByKind(req.params.requestId, kind as string);
      } else {
        attachments = await storage.getAttachmentsByRequest(req.params.requestId);
      }
      res.json(attachments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch attachments" });
    }
  });

  app.post("/api/service-requests/:requestId/attachments", async (req, res) => {
    try {
      const { fileName, fileUrl, fileType, kind } = req.body;
      
      // Use session user for authorization
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      if (!fileName || !fileUrl) {
        return res.status(400).json({ error: "fileName and fileUrl are required" });
      }

      // Validate kind is either 'request' or 'deliverable'
      const validKinds = ["request", "deliverable"];
      const attachmentKind = kind || "request";
      if (!validKinds.includes(attachmentKind)) {
        return res.status(400).json({ error: "kind must be 'request' or 'deliverable'" });
      }

      // Verify the request exists and check ownership/assignment
      const existingRequest = await storage.getServiceRequest(req.params.requestId);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // For request attachments: only the original requester can upload
      if (attachmentKind === "request") {
        if (existingRequest.userId !== sessionUserId) {
          return res.status(403).json({ error: "Only the request owner can upload request files" });
        }
      }

      // For deliverable attachments: only assigned job managers can upload (admins can always upload)
      if (attachmentKind === "deliverable") {
        const canUploadDeliverables = ["admin", "internal_designer", "vendor", "vendor_designer", "designer"].includes(sessionUser.role);
        if (!canUploadDeliverables) {
          return res.status(403).json({ error: "You don't have permission to upload deliverables" });
        }
        // Admins can always upload deliverables, others must be the assigned user
        if (sessionUser.role !== "admin" && existingRequest.assigneeId !== sessionUserId) {
          return res.status(403).json({ error: "Only the assigned user can upload deliverables" });
        }
        // Deliverables can only be uploaded when job is in-progress or change-request
        if (existingRequest.status !== "in-progress" && existingRequest.status !== "change-request") {
          return res.status(400).json({ error: "Can only upload deliverables for in-progress jobs" });
        }
      }

      const attachment = await storage.createAttachment({
        fileName,
        fileUrl,
        fileType,
        kind: attachmentKind,
        uploadedBy: sessionUserId,
        requestId: req.params.requestId,
      });
      res.status(201).json(attachment);
    } catch (error) {
      console.error("Error creating attachment:", error);
      res.status(500).json({ error: "Failed to create attachment" });
    }
  });

  // Delete an attachment (only pending/unversioned attachments can be deleted)
  app.delete("/api/attachments/:attachmentId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const attachment = await storage.getAttachment(req.params.attachmentId);
      if (!attachment) {
        return res.status(404).json({ error: "Attachment not found" });
      }

      // Only allow deleting unversioned (pending) attachments
      if (attachment.deliveryId) {
        return res.status(400).json({ error: "Cannot delete delivered attachments" });
      }

      // Check permissions: only the uploader, admin, or request assignee can delete
      const request = await storage.getServiceRequest(attachment.requestId);
      const canDelete = 
        sessionUser.role === "admin" ||
        attachment.uploadedBy === sessionUserId ||
        (request && request.assigneeId === sessionUserId);

      if (!canDelete) {
        return res.status(403).json({ error: "You don't have permission to delete this attachment" });
      }

      await storage.deleteAttachment(req.params.attachmentId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting attachment:", error);
      res.status(500).json({ error: "Failed to delete attachment" });
    }
  });

  // Get delivery versions for a service request (file deliverables only)
  app.get("/api/service-requests/:requestId/deliveries", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.requestId);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Clients/Distributors can only view deliveries for their own requests
      if ((sessionUser.role === "client" || sessionUser.role === "distributor") && existingRequest.userId !== sessionUserId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get all delivery versions ordered by version DESC (newest first)
      const deliveries = await storage.getDeliveriesByRequest(req.params.requestId);
      
      // Enrich with deliverer info
      const enrichedDeliveries = await Promise.all(
        deliveries.map(async (delivery) => {
          const deliverer = await storage.getUser(delivery.deliveredBy);
          return {
            ...delivery,
            deliverer: deliverer ? { id: deliverer.id, username: deliverer.username, role: deliverer.role } : null
          };
        })
      );

      res.json(enrichedDeliveries);
    } catch (error) {
      console.error("Error fetching deliveries:", error);
      res.status(500).json({ error: "Failed to fetch deliveries" });
    }
  });

  // Comments routes - requires authentication and ownership/assignment check
  app.get("/api/service-requests/:requestId/comments", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.requestId);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Clients/Distributors can only view comments for their own requests
      if ((sessionUser.role === "client" || sessionUser.role === "distributor") && existingRequest.userId !== sessionUserId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Determine visibility based on role
      let effectiveVisibility = "public"; // Default to public only
      if (sessionUser.role === "designer") {
        effectiveVisibility = "all"; // Designers can see all comments including internal
      }
      
      const comments = await storage.getCommentsByRequest(
        req.params.requestId, 
        effectiveVisibility
      );
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.post("/api/service-requests/:requestId/comments", async (req, res) => {
    try {
      const { body, visibility = "public", parentId } = req.body;
      
      // Use session user for authorization
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      if (!body) {
        return res.status(400).json({ error: "body is required" });
      }

      // Verify the session user exists
      const author = await storage.getUser(sessionUserId);
      if (!author) {
        return res.status(401).json({ error: "User not found" });
      }

      // Verify the request exists and check access
      const existingRequest = await storage.getServiceRequest(req.params.requestId);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Clients/Distributors can only comment on their own requests
      if ((author.role === "client" || author.role === "distributor") && existingRequest.userId !== sessionUserId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Only designers can create internal comments
      if (visibility === "internal" && author.role !== "designer") {
        return res.status(403).json({ error: "Only designers can create internal comments" });
      }

      const comment = await storage.createComment({
        requestId: req.params.requestId,
        authorId: sessionUserId,
        body,
        visibility,
        parentId,
      });
      res.status(201).json(comment);
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ error: "Failed to create comment" });
    }
  });

  // Get current session user
  app.get("/api/current-user", async (req, res) => {
    try {
      if (req.session.userId) {
        const user = await storage.getUser(req.session.userId);
        if (user) {
          return res.json({ userId: user.id, role: user.role, username: user.username });
        }
      }
      // No session user, return null
      res.json({ userId: null, role: null, username: null });
    } catch (error) {
      console.error("Error getting current user:", error);
      res.status(500).json({ error: "Failed to get current user" });
    }
  });

  // Get or create default user and set in session
  app.get("/api/default-user", async (req, res) => {
    try {
      // Prevent browser caching - this endpoint depends on session state
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      
      // If user already in session, return that user
      if (req.session.userId) {
        const existingUser = await storage.getUser(req.session.userId);
        if (existingUser) {
          const response: any = { 
            userId: existingUser.id, 
            role: existingUser.role, 
            username: existingUser.username,
            email: existingUser.email,
            phone: existingUser.phone,
            clientProfileId: existingUser.clientProfileId,
            vendorId: existingUser.vendorId
          };
          // Include impersonation info if applicable
          if (req.session.impersonatorId) {
            response.impersonating = true;
            response.impersonatorId = req.session.impersonatorId;
          }
          return res.json(response);
        }
      }

      let user = await storage.getUserByUsername("default-user");
      if (!user) {
        user = await storage.createUser({
          username: "default-user",
          password: "not-used",
          email: "default@example.com",
          role: "client",
        });
      }
      
      // Store in session
      req.session.userId = user.id;
      req.session.userRole = user.role;
      
      res.json({ userId: user.id, role: user.role, username: user.username, email: user.email, phone: user.phone, clientProfileId: user.clientProfileId, vendorId: user.vendorId });
    } catch (error) {
      console.error("Error getting default user:", error);
      res.status(500).json({ error: "Failed to get default user" });
    }
  });

  // Switch user role (for demo purposes) - updates session
  app.post("/api/switch-role", async (req, res) => {
    try {
      const { role } = req.body;
      const validRoles = ["admin", "internal_designer", "vendor", "vendor_designer", "client", "designer"];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ error: `role must be one of: ${validRoles.join(", ")}` });
      }

      let user;
      
      // For client role, switch to the default-user who owns the original requests
      // This allows testing the client experience with their own requests
      if (role === "client") {
        user = await storage.getUserByUsername("default-user");
        if (!user) {
          user = await storage.createUser({
            username: "default-user",
            password: "not-used",
            email: "default@example.com",
            role: "client",
          });
        }
        // Ensure the default-user has client role
        if (user.role !== "client") {
          user = await storage.updateUser(user.id, { role: "client" });
        }
      }
      
      // For other roles, switch to the dedicated demo user
      if (!user) {
        // For vendor role, use Pixel's Hive vendor (Javier Rubianes) for testing
        const username = role === "vendor" ? "Javier Rubianes" : `${role}-user`;
        user = await storage.getUserByUsername(username);
        
        if (!user) {
          user = await storage.createUser({
            username,
            password: "not-used",
            email: `${username}@example.com`,
            role,
          });
        } else if (user.role !== role) {
          // Ensure the user's role matches the target role
          user = await storage.updateUser(user.id, { role });
        }
      }
      
      // Clear impersonation when switching roles
      req.session.impersonatorId = undefined;
      
      // Update session with new user
      req.session.userId = user!.id;
      req.session.userRole = user!.role;
      
      console.log(`[switch-role] Switched to ${role}: userId=${user!.id}, username=${user!.username}`);
      
      // Update lastLoginAt
      await storage.updateUser(user!.id, { lastLoginAt: new Date() });
      
      // Prevent caching
      res.set('Cache-Control', 'no-store');
      // Return full user object for optimistic UI updates
      res.json({ role: user!.role, user: user });
    } catch (error) {
      console.error("Error switching role:", error);
      res.status(500).json({ error: "Failed to switch role" });
    }
  });

  // Admin impersonation - login as another user
  app.post("/api/users/:id/impersonate", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Check if already impersonating - don't allow nested impersonation
      if (req.session.impersonatorId) {
        return res.status(400).json({ error: "Already impersonating a user. Exit impersonation first." });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(403).json({ error: "User not found" });
      }

      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check authorization: admin can impersonate anyone, vendor can impersonate their team
      let canImpersonate = false;
      if (sessionUser.role === "admin") {
        canImpersonate = true;
      } else if (sessionUser.role === "vendor") {
        const vendorStructureId = sessionUser.vendorId || sessionUser.id;
        canImpersonate = 
          targetUser.vendorId === vendorStructureId &&
          ["vendor", "vendor_designer"].includes(targetUser.role) &&
          targetUser.id !== sessionUser.id;
      }

      if (!canImpersonate) {
        return res.status(403).json({ error: "You do not have permission to impersonate this user" });
      }

      // Store the original user ID and switch to target user
      req.session.impersonatorId = sessionUserId;
      req.session.userId = targetUser.id;
      req.session.userRole = targetUser.role;

      res.json({ 
        userId: targetUser.id, 
        role: targetUser.role, 
        username: targetUser.username,
        impersonating: true,
        impersonatorId: sessionUserId 
      });
    } catch (error) {
      console.error("Error impersonating user:", error);
      res.status(500).json({ error: "Failed to impersonate user" });
    }
  });

  // Exit impersonation - return to original user
  app.post("/api/impersonation/exit", async (req, res) => {
    try {
      const impersonatorId = req.session.impersonatorId;
      if (!impersonatorId) {
        return res.status(400).json({ error: "Not currently impersonating any user" });
      }

      const originalUser = await storage.getUser(impersonatorId);
      if (!originalUser) {
        return res.status(404).json({ error: "Original user not found" });
      }

      // Restore the original user session
      req.session.userId = originalUser.id;
      req.session.userRole = originalUser.role;
      delete req.session.impersonatorId;

      // Return full user object for optimistic UI updates
      res.json({ user: originalUser });
    } catch (error) {
      console.error("Error exiting impersonation:", error);
      res.status(500).json({ error: "Failed to exit impersonation" });
    }
  });

  // Vendor edit team member - allows vendor to update team member details
  app.patch("/api/vendor/users/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(403).json({ error: "User not found" });
      }

      // Only vendors can use this endpoint
      if (sessionUser.role !== "vendor") {
        return res.status(403).json({ error: "Only vendors can edit team members" });
      }

      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verify target user belongs to vendor's team
      const vendorStructureId = sessionUser.vendorId || sessionUser.id;
      const isTeamMember = 
        (targetUser.vendorId === vendorStructureId || targetUser.id === vendorStructureId) &&
        ["vendor", "vendor_designer"].includes(targetUser.role);

      if (!isTeamMember) {
        return res.status(403).json({ error: "User is not part of your vendor team" });
      }

      // Only allow editing safe fields (username, email, phone)
      const { username, email, phone } = req.body;
      const updateData: Partial<{ username: string; email: string; phone: string }> = {};
      
      if (username !== undefined) updateData.username = username;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const updatedUser = await storage.updateUser(req.params.id, updateData);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating team member:", error);
      res.status(500).json({ error: "Failed to update team member" });
    }
  });

  // Seed initial services data
  app.post("/api/seed", async (req, res) => {
    try {
      console.log("Checking for existing services...");
      const existingServices = await storage.getAllServices();
      console.log("Found", existingServices.length, "existing services");
      
      // Always ensure designer users exist
      const designerUsers = [
        { username: "designer-user", email: "designer@example.com" },
        { username: "Sarah Martinez", email: "sarah.martinez@example.com" },
        { username: "Mike Chen", email: "mike.chen@example.com" },
        { username: "Emma Johnson", email: "emma.johnson@example.com" },
      ];

      for (const designer of designerUsers) {
        const existing = await storage.getUserByUsername(designer.username);
        if (!existing) {
          await storage.createUser({
            username: designer.username,
            password: "not-used",
            email: designer.email,
            role: "designer",
          });
        }
      }
      
      if (existingServices.length > 0) {
        return res.json({ message: "Services already seeded, designers checked" });
      }

      console.log("Seeding services...");
      const servicesData = [
        {
          title: "Vectorization",
          description: "Turn fuzzy images into sharp vectors, ready for screen printing.",
          basePrice: "10.00",
          priceRange: "$ 10",
          category: "production",
          decorationMethods: "Screen Printing",
        },
        {
          title: "Artwork Touch-Ups",
          description: "Clean, refine, and prep your artwork for flawless digital prints.",
          basePrice: "10.00",
          priceRange: "$ 10",
          category: "production",
          decorationMethods: "DTF, DTG",
        },
        {
          title: "Artwork Composition",
          description: "Transform your logo into a polished new design or template.",
          basePrice: "10.00",
          priceRange: "$ 10",
          category: "creative",
          decorationMethods: "Digital Inkjet, DTF, DTG, Embroidery, Laser Etching, Puff Embroidery, Screen Printing, Sublimation, Sublimation Cut & Sew, UV DTF",
        },
        {
          title: "Creative Art",
          description: "Original artwork from just your idea, text, or inspiration.",
          basePrice: "40.00",
          priceRange: "$ 40 - $ 100",
          category: "creative",
          decorationMethods: "Digital Inkjet, DTF, DTG, Embroidery, Laser Etching, Puff Embroidery, Screen Printing, Sublimation, Sublimation Cut & Sew, UV DTF",
        },
        {
          title: "Embroidery Digitization",
          description: "Convert your artwork into stitch-perfect embroidery files.",
          basePrice: "15.00",
          priceRange: "$ 15",
          category: "production",
          decorationMethods: "Embroidery",
          serviceHierarchy: "father",
        },
        {
          title: "Vectorization for Embroidery",
          description: "Convert raster artwork to vector format for clean embroidery digitization.",
          basePrice: "5.00",
          priceRange: "+ $ 5",
          category: "production",
          decorationMethods: "Embroidery",
          serviceHierarchy: "son",
          parentServiceTitle: "Embroidery Digitization", // Will be resolved to ID after creation
        },
        {
          title: "Dye-Sublimation Template",
          description: "Full-coverage artwork templates tailored for all-over prints.",
          basePrice: "60.00",
          priceRange: "$ 60",
          category: "production",
          decorationMethods: "Dye-Sublimation",
        },
        {
          title: "Store Banner Design",
          description: "Create digital banners for your Store to communicate better.",
          basePrice: "10.00",
          priceRange: "$ 10",
          category: "marketing",
          decorationMethods: "Digital",
        },
        {
          title: "Flyer Design",
          description: "Marketing graphics designed for print-ready impact.",
          basePrice: "10.00",
          priceRange: "$ 10",
          category: "marketing",
          decorationMethods: "Digital",
        },
        {
          title: "Store Creation",
          description: "Create an amazing custom store from scratch",
          basePrice: "1.50",
          priceRange: "Pricing Breakdown",
          category: "other",
          decorationMethods: "N/A",
        },
        {
          title: "Blank Product - PSD",
          description: "Request any Blank you would like to be added to your Catalog.",
          basePrice: "30.00",
          priceRange: "$ 30",
          category: "other",
          decorationMethods: "Digital",
        },
      ];

      // First pass: create father services and services without hierarchy
      const createdServices: Record<string, string> = {}; // title -> id mapping
      
      for (const serviceData of servicesData) {
        if (serviceData.serviceHierarchy !== "son") {
          console.log("Creating service:", serviceData.title);
          const created = await storage.createService(serviceData);
          createdServices[serviceData.title] = created.id;
        }
      }
      
      // Second pass: create son services with resolved parent IDs
      for (const serviceData of servicesData) {
        if (serviceData.serviceHierarchy === "son" && (serviceData as any).parentServiceTitle) {
          const parentId = createdServices[(serviceData as any).parentServiceTitle];
          if (parentId) {
            console.log("Creating son service:", serviceData.title, "with parent:", (serviceData as any).parentServiceTitle);
            const { parentServiceTitle, ...data } = serviceData as any;
            await storage.createService({
              ...data,
              parentServiceId: parentId,
            });
          } else {
            console.warn("Parent service not found for:", serviceData.title);
          }
        }
      }

      console.log("Services and users seeded successfully");
      res.json({ message: "Services and users seeded successfully" });
    } catch (error) {
      console.error("Error seeding services:", error);
      res.status(500).json({ error: "Failed to seed services", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // ========== User Management Routes ==========
  
  // Create/Invite a new user
  app.post("/api/users", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const { role: newUserRole, vendorId } = req.body;

      // Role-based invitation permissions
      // Admin can invite any role
      // Internal Designer can invite internal_designer, vendor, vendor_designer
      // Vendor can invite vendor, vendor_designer (under their structure)
      const canInvite = () => {
        if (sessionUser.role === "admin") return true;
        if (sessionUser.role === "internal_designer") {
          return ["internal_designer", "vendor", "vendor_designer"].includes(newUserRole);
        }
        if (sessionUser.role === "vendor") {
          return ["vendor", "vendor_designer"].includes(newUserRole);
        }
        return false;
      };

      if (!canInvite()) {
        return res.status(403).json({ error: "You don't have permission to invite this role" });
      }

      // For vendor users, ensure vendorId is set if created by vendor
      let finalVendorId = vendorId;
      if (sessionUser.role === "vendor" && ["vendor", "vendor_designer"].includes(newUserRole)) {
        finalVendorId = sessionUser.vendorId || sessionUserId;
      }

      const newUser = await storage.createUser({
        ...req.body,
        vendorId: finalVendorId,
        invitedBy: sessionUserId,
      });

      // Auto-create client profile for standalone client users
      if (newUserRole === "client" && !req.body.clientProfileId) {
        const clientProfile = await storage.createClientProfile({
          primaryUserId: newUser.id,
          companyName: req.body.username,
        });
        await storage.updateUser(newUser.id, { clientProfileId: clientProfile.id });
      }

      res.status(201).json(newUser);
    } catch (error: any) {
      console.error("Error creating user:", error);
      if (error.code === "23505" && error.constraint === "users_username_unique") {
        return res.status(400).json({ error: "Username already exists. Please choose a different username." });
      }
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  // Update user (including activate/deactivate)
  app.patch("/api/users/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "Target user not found" });
      }

      // Permission check for activating/deactivating users
      const canModify = async () => {
        // Admin can modify anyone
        if (sessionUser.role === "admin") return true;
        // Vendor can modify vendors/vendor_designers under their structure
        if (sessionUser.role === "vendor") {
          const vendorStructureId = sessionUser.vendorId || sessionUserId;
          return targetUser.vendorId === vendorStructureId && 
                 ["vendor", "vendor_designer"].includes(targetUser.role);
        }
        // Primary client can modify client team members in their company
        if (sessionUser.role === "client" && sessionUser.clientProfileId && targetUser.role === "client") {
          const clientProfile = await storage.getClientProfileById(sessionUser.clientProfileId);
          if (clientProfile && clientProfile.primaryUserId === sessionUserId) {
            // Primary client can modify team members (same clientProfileId) but not themselves
            return targetUser.clientProfileId === sessionUser.clientProfileId && 
                   targetUser.id !== sessionUserId;
          }
        }
        return false;
      };

      if (!(await canModify())) {
        return res.status(403).json({ error: "You don't have permission to modify this user" });
      }

      // Filter fields based on role permissions
      // Admins can edit everything, vendors can only edit basic info
      const { username, email, phone, role, paymentMethod, isActive } = req.body;
      
      let updateData: Record<string, any> = {};
      
      // Basic fields that any authorized user can edit
      if (username !== undefined) updateData.username = username;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (isActive !== undefined) updateData.isActive = isActive;
      
      // Role and payment type can only be edited by admins
      if (sessionUser.role === "admin") {
        if (role !== undefined) {
          updateData.role = role;
          // Clear paymentMethod if role is changed to non-client
          if (role !== "client") {
            updateData.paymentMethod = null;
          }
        }
        // Only allow paymentMethod for clients
        if (paymentMethod !== undefined && (role === "client" || (!role && targetUser.role === "client"))) {
          updateData.paymentMethod = paymentMethod;
        }
      }

      const updatedUser = await storage.updateUser(req.params.id, updateData);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Delete user
  app.delete("/api/users/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "Target user not found" });
      }

      // Cannot delete yourself
      if (targetUser.id === sessionUserId) {
        return res.status(403).json({ error: "You cannot delete yourself" });
      }

      // Permission check for deleting users
      const canDelete = async () => {
        // Admin can delete anyone except themselves
        if (sessionUser.role === "admin") return true;
        
        // Vendor can delete vendor_designers under their structure (not primary)
        if (sessionUser.role === "vendor") {
          const vendorStructureId = sessionUser.vendorId || sessionUserId;
          // Can only delete vendor_designers, not primary vendor
          return targetUser.vendorId === vendorStructureId && 
                 targetUser.role === "vendor_designer";
        }
        
        // Primary client can delete non-primary client team members
        if (sessionUser.role === "client" && sessionUser.clientProfileId && targetUser.role === "client") {
          const clientProfile = await storage.getClientProfileById(sessionUser.clientProfileId);
          if (clientProfile && clientProfile.primaryUserId === sessionUserId) {
            // Primary client can delete team members (same clientProfileId) but not themselves
            return targetUser.clientProfileId === sessionUser.clientProfileId && 
                   targetUser.id !== clientProfile.primaryUserId;
          }
        }
        return false;
      };

      if (!(await canDelete())) {
        return res.status(403).json({ error: "You don't have permission to delete this user" });
      }

      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Get users by vendor (for vendor team management)
  app.get("/api/users/vendor/:vendorId", async (req, res) => {
    try {
      const users = await storage.getUsersByVendor(req.params.vendorId);
      res.json(users);
    } catch (error) {
      console.error("Error fetching vendor users:", error);
      res.status(500).json({ error: "Failed to fetch vendor users" });
    }
  });

  // ========== Vendor Profile Routes ==========
  
  app.get("/api/vendor-profiles", async (req, res) => {
    try {
      const profiles = await storage.getAllVendorProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching vendor profiles:", error);
      res.status(500).json({ error: "Failed to fetch vendor profiles" });
    }
  });

  app.get("/api/vendor-profiles/:id", async (req, res) => {
    try {
      const profile = await storage.getVendorProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching vendor profile:", error);
      res.status(500).json({ error: "Failed to fetch vendor profile" });
    }
  });

  app.get("/api/vendor-profiles/user/:userId", async (req, res) => {
    try {
      const profile = await storage.getVendorProfile(req.params.userId);
      if (!profile) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }
      res.json(profile);
    } catch (error) {
      console.error("Error fetching vendor profile:", error);
      res.status(500).json({ error: "Failed to fetch vendor profile" });
    }
  });

  app.post("/api/vendor-profiles", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Admin can create profiles for anyone, vendors can create their own profile
      if (sessionUser.role !== "admin" && sessionUser.role !== "vendor") {
        return res.status(403).json({ error: "Only admins and vendors can create vendor profiles" });
      }

      // Vendors can only create their own profile
      if (sessionUser.role === "vendor" && req.body.userId !== sessionUserId) {
        return res.status(403).json({ error: "Vendors can only create their own profile" });
      }

      // Check if profile already exists for this user
      const existingProfile = await storage.getVendorProfile(req.body.userId);
      if (existingProfile) {
        return res.status(400).json({ error: "Profile already exists for this user" });
      }

      const profile = await storage.createVendorProfile(req.body);
      res.status(201).json(profile);
    } catch (error) {
      console.error("Error creating vendor profile:", error);
      res.status(500).json({ error: "Failed to create vendor profile" });
    }
  });

  app.patch("/api/vendor-profiles/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const profile = await storage.getVendorProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      // Admin can update any profile, Vendor can update their own
      const canUpdate = sessionUser.role === "admin" || 
                        (sessionUser.role === "vendor" && profile.userId === sessionUserId);

      if (!canUpdate) {
        return res.status(403).json({ error: "You don't have permission to update this profile" });
      }

      const updatedProfile = await storage.updateVendorProfile(req.params.id, req.body);
      res.json(updatedProfile);
    } catch (error) {
      console.error("Error updating vendor profile:", error);
      res.status(500).json({ error: "Failed to update vendor profile" });
    }
  });

  app.delete("/api/vendor-profiles/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      if (sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only admins can delete vendors" });
      }

      const profile = await storage.getVendorProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }

      await storage.deleteVendor(req.params.id);
      res.json({ success: true, message: "Vendor deleted successfully" });
    } catch (error) {
      console.error("Error deleting vendor:", error);
      res.status(500).json({ error: "Failed to delete vendor" });
    }
  });

  // ========== Client Profile Routes ==========

  app.get("/api/client-profiles", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Only admin can list all client profiles
      if (sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only admins can list all client profiles" });
      }

      const profiles = await storage.getAllClientProfiles();
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching client profiles:", error);
      res.status(500).json({ error: "Failed to fetch client profiles" });
    }
  });

  app.get("/api/client-profiles/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client profile not found" });
      }

      // Admin can view any profile, clients can only view their own company profile
      const canView = sessionUser.role === "admin" || 
                      sessionUser.clientProfileId === req.params.id;
      
      if (!canView) {
        return res.status(403).json({ error: "You don't have permission to view this profile" });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error fetching client profile:", error);
      res.status(500).json({ error: "Failed to fetch client profile" });
    }
  });

  app.get("/api/client-profiles/user/:userId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const profile = await storage.getClientProfile(req.params.userId);
      if (!profile) {
        return res.status(404).json({ error: "Client profile not found" });
      }

      // Admin can view any profile, clients can only view their own company profile
      const canView = sessionUser.role === "admin" || 
                      sessionUser.clientProfileId === profile.id;
      
      if (!canView) {
        return res.status(403).json({ error: "You don't have permission to view this profile" });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error fetching client profile:", error);
      res.status(500).json({ error: "Failed to fetch client profile" });
    }
  });

  // Get client profile by clientProfileId (for team members)
  app.get("/api/client-profiles/by-profile/:profileId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const profile = await storage.getClientProfileById(req.params.profileId);
      if (!profile) {
        return res.status(404).json({ error: "Client profile not found" });
      }

      // Admin can view any profile, clients can only view their own company profile
      const canView = sessionUser.role === "admin" || 
                      sessionUser.clientProfileId === req.params.profileId;
      
      if (!canView) {
        return res.status(403).json({ error: "You don't have permission to view this profile" });
      }

      res.json(profile);
    } catch (error) {
      console.error("Error fetching client profile:", error);
      res.status(500).json({ error: "Failed to fetch client profile" });
    }
  });

  app.post("/api/client-profiles", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Admin can create profiles for anyone, clients can create their own profile
      if (sessionUser.role !== "admin" && sessionUser.role !== "client") {
        return res.status(403).json({ error: "Only admins and clients can create client profiles" });
      }

      // Clients can only create their own profile
      if (sessionUser.role === "client" && req.body.primaryUserId !== sessionUserId) {
        return res.status(403).json({ error: "Clients can only create their own profile" });
      }

      // Check if profile already exists for this user
      const existingProfile = await storage.getClientProfile(req.body.primaryUserId);
      if (existingProfile) {
        return res.status(400).json({ error: "Profile already exists for this user" });
      }

      const profile = await storage.createClientProfile(req.body);
      
      // Link the primary user to this client profile
      await storage.updateUser(req.body.primaryUserId, { clientProfileId: profile.id });
      
      res.status(201).json(profile);
    } catch (error) {
      console.error("Error creating client profile:", error);
      res.status(500).json({ error: "Failed to create client profile" });
    }
  });

  app.patch("/api/client-profiles/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client profile not found" });
      }

      // Admin can update any profile, primary client can update their own
      const canUpdate = sessionUser.role === "admin" || 
                        (sessionUser.role === "client" && profile.primaryUserId === sessionUserId);

      if (!canUpdate) {
        return res.status(403).json({ error: "You don't have permission to update this profile" });
      }

      const updatedProfile = await storage.updateClientProfile(req.params.id, req.body);
      res.json(updatedProfile);
    } catch (error) {
      console.error("Error updating client profile:", error);
      res.status(500).json({ error: "Failed to update client profile" });
    }
  });

  // Get team members for a client company
  app.get("/api/client-profiles/:id/team", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client profile not found" });
      }

      // Admin, or client from same company can view team
      const canView = sessionUser.role === "admin" || 
                      sessionUser.clientProfileId === req.params.id;

      if (!canView) {
        return res.status(403).json({ error: "You don't have permission to view this team" });
      }

      const teamMembers = await storage.getClientTeamMembers(req.params.id);
      res.json(teamMembers);
    } catch (error) {
      console.error("Error fetching client team:", error);
      res.status(500).json({ error: "Failed to fetch client team" });
    }
  });

  // Invite a new client team member
  app.post("/api/client-profiles/:id/invite", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client profile not found" });
      }

      // Admin or primary client can invite team members
      const canInvite = sessionUser.role === "admin" || 
                        (sessionUser.role === "client" && profile.primaryUserId === sessionUserId);

      if (!canInvite) {
        return res.status(403).json({ error: "You don't have permission to invite team members" });
      }

      const { username, email, phone, password } = req.body;

      // Check for existing user with same username
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      // Create the new client user linked to this company
      const newUser = await storage.createUser({
        username,
        email,
        phone,
        password,
        role: "client",
        invitedBy: sessionUserId,
        clientProfileId: req.params.id,
      });

      res.status(201).json(newUser);
    } catch (error) {
      console.error("Error inviting client team member:", error);
      res.status(500).json({ error: "Failed to invite team member" });
    }
  });

  // Remove a team member from client company (soft delete or unlink)
  app.delete("/api/client-profiles/:id/team/:userId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client profile not found" });
      }

      // Only admin or primary client can remove team members
      const canRemove = sessionUser.role === "admin" || 
                        (sessionUser.role === "client" && profile.primaryUserId === sessionUserId);

      if (!canRemove) {
        return res.status(403).json({ error: "You don't have permission to remove team members" });
      }

      const targetUser = await storage.getUser(req.params.userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verify target user belongs to this company
      if (targetUser.clientProfileId !== req.params.id) {
        return res.status(403).json({ error: "User does not belong to this company" });
      }

      // Cannot remove the primary user
      if (targetUser.id === profile.primaryUserId) {
        return res.status(403).json({ error: "Cannot remove the primary account holder" });
      }

      // Cannot remove yourself
      if (targetUser.id === sessionUserId) {
        return res.status(403).json({ error: "Cannot remove yourself" });
      }

      // Deactivate the user and unlink from company
      await storage.updateUser(req.params.userId, { 
        isActive: false,
        clientProfileId: null 
      });

      res.json({ success: true, message: "Team member removed" });
    } catch (error) {
      console.error("Error removing client team member:", error);
      res.status(500).json({ error: "Failed to remove team member" });
    }
  });

  // System settings routes
  app.get("/api/system-settings/pricing", async (req, res) => {
    try {
      const setting = await storage.getSystemSetting("pricing");
      res.json(setting?.settingValue || {});
    } catch (error) {
      console.error("Error fetching pricing settings:", error);
      res.status(500).json({ error: "Failed to fetch pricing settings" });
    }
  });

  app.put("/api/system-settings/pricing", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only admins can update pricing settings" });
      }

      const setting = await storage.setSystemSetting("pricing", req.body);
      res.json(setting.settingValue);
    } catch (error) {
      console.error("Error updating pricing settings:", error);
      res.status(500).json({ error: "Failed to update pricing settings" });
    }
  });

  // Object storage routes for file uploads (public file uploading)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.post("/api/objects/upload", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.put("/api/artwork-files", async (req, res) => {
    if (!req.body.fileURL) {
      return res.status(400).json({ error: "fileURL is required" });
    }

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = objectStorageService.normalizeObjectEntityPath(req.body.fileURL);

      res.status(200).json({
        objectPath: objectPath,
        fileName: req.body.fileName || "uploaded-file",
      });
    } catch (error) {
      console.error("Error processing artwork file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ==================== BUNDLE LINE ITEMS ROUTES (Admin only) ====================
  app.get("/api/bundle-line-items", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin, internal_designer, vendor, and vendor_designer to read bundle line items
      if (!sessionUser || !["admin", "internal_designer", "vendor", "vendor_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const items = await storage.getAllBundleLineItems();
      res.json(items);
    } catch (error) {
      console.error("Error fetching bundle line items:", error);
      res.status(500).json({ error: "Failed to fetch bundle line items" });
    }
  });

  app.post("/api/bundle-line-items", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const item = await storage.createBundleLineItem(req.body);
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating bundle line item:", error);
      res.status(500).json({ error: "Failed to create bundle line item" });
    }
  });

  app.patch("/api/bundle-line-items/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const item = await storage.updateBundleLineItem(req.params.id, req.body);
      if (!item) {
        return res.status(404).json({ error: "Bundle line item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error updating bundle line item:", error);
      res.status(500).json({ error: "Failed to update bundle line item" });
    }
  });

  app.delete("/api/bundle-line-items/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      await storage.deleteBundleLineItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting bundle line item:", error);
      res.status(500).json({ error: "Failed to delete bundle line item" });
    }
  });

  // ==================== PUBLIC BUNDLES/PACKS ROUTES (For client catalog view) ====================
  app.get("/api/public/bundles", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const allBundles = await storage.getAllBundles();
      const activeBundles = allBundles.filter(b => b.isActive);
      
      const bundlesWithItems = await Promise.all(
        activeBundles.map(async (bundle) => {
          const items = await storage.getBundleItems(bundle.id);
          const itemsWithDetails = await Promise.all(
            items.map(async (item) => {
              let service = null;
              let lineItem = null;
              if (item.serviceId) {
                service = await storage.getService(item.serviceId);
              }
              if (item.lineItemId) {
                lineItem = await storage.getBundleLineItem(item.lineItemId);
              }
              return { ...item, service, lineItem };
            })
          );
          return { ...bundle, items: itemsWithDetails };
        })
      );
      
      res.json(bundlesWithItems);
    } catch (error) {
      console.error("Error fetching public bundles:", error);
      res.status(500).json({ error: "Failed to fetch bundles" });
    }
  });

  app.get("/api/public/service-packs", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const allPacks = await storage.getAllServicePacks();
      const activePacks = allPacks.filter(p => p.isActive);
      
      const packsWithItems = await Promise.all(
        activePacks.map(async (pack) => {
          const items = await storage.getServicePackItems(pack.id);
          const itemsWithServices = await Promise.all(
            items.map(async (item) => {
              const service = await storage.getService(item.serviceId);
              return { ...item, service };
            })
          );
          return { ...pack, items: itemsWithServices };
        })
      );
      
      res.json(packsWithItems);
    } catch (error) {
      console.error("Error fetching public service packs:", error);
      res.status(500).json({ error: "Failed to fetch service packs" });
    }
  });

  // ==================== BUNDLES ROUTES (Admin + Vendor read access) ====================
  app.get("/api/bundles", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin, internal_designer, vendor, and vendor_designer to read bundles
      if (!sessionUser || !["admin", "internal_designer", "vendor", "vendor_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const bundlesList = await storage.getAllBundles();
      res.json(bundlesList);
    } catch (error) {
      console.error("Error fetching bundles:", error);
      res.status(500).json({ error: "Failed to fetch bundles" });
    }
  });

  app.get("/api/bundles/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin, vendor, and vendor_designer to read bundles
      if (!sessionUser || !["admin", "vendor", "vendor_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const bundle = await storage.getBundle(req.params.id);
      if (!bundle) {
        return res.status(404).json({ error: "Bundle not found" });
      }
      res.json(bundle);
    } catch (error) {
      console.error("Error fetching bundle:", error);
      res.status(500).json({ error: "Failed to fetch bundle" });
    }
  });

  app.post("/api/bundles", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const bundle = await storage.createBundle(req.body);
      res.status(201).json(bundle);
    } catch (error) {
      console.error("Error creating bundle:", error);
      res.status(500).json({ error: "Failed to create bundle" });
    }
  });

  app.patch("/api/bundles/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const bundle = await storage.updateBundle(req.params.id, req.body);
      if (!bundle) {
        return res.status(404).json({ error: "Bundle not found" });
      }
      res.json(bundle);
    } catch (error) {
      console.error("Error updating bundle:", error);
      res.status(500).json({ error: "Failed to update bundle" });
    }
  });

  app.delete("/api/bundles/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      await storage.deleteBundle(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting bundle:", error);
      res.status(500).json({ error: "Failed to delete bundle" });
    }
  });

  app.get("/api/bundles/:id/items", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin, vendor, and vendor_designer to read bundle items
      if (!sessionUser || !["admin", "vendor", "vendor_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const items = await storage.getBundleItems(req.params.id);
      res.json(items);
    } catch (error) {
      console.error("Error fetching bundle items:", error);
      res.status(500).json({ error: "Failed to fetch bundle items" });
    }
  });

  app.post("/api/bundles/:id/items", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const item = await storage.addBundleItem({ ...req.body, bundleId: req.params.id });
      res.status(201).json(item);
    } catch (error) {
      console.error("Error adding bundle item:", error);
      res.status(500).json({ error: "Failed to add bundle item" });
    }
  });

  app.delete("/api/bundles/:id/items/:itemId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      await storage.removeBundleItem(req.params.itemId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing bundle item:", error);
      res.status(500).json({ error: "Failed to remove bundle item" });
    }
  });

  // ==================== SERVICE PACKS ROUTES (Admin only) ====================
  app.get("/api/service-packs", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin, vendor, and vendor_designer to read service packs
      if (!sessionUser || !["admin", "vendor", "vendor_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const packs = await storage.getAllServicePacks();
      res.json(packs);
    } catch (error) {
      console.error("Error fetching service packs:", error);
      res.status(500).json({ error: "Failed to fetch service packs" });
    }
  });

  app.get("/api/service-packs/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin, vendor, and vendor_designer to read service packs
      if (!sessionUser || !["admin", "vendor", "vendor_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const pack = await storage.getServicePack(req.params.id);
      if (!pack) {
        return res.status(404).json({ error: "Service pack not found" });
      }
      res.json(pack);
    } catch (error) {
      console.error("Error fetching service pack:", error);
      res.status(500).json({ error: "Failed to fetch service pack" });
    }
  });

  app.post("/api/service-packs", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const pack = await storage.createServicePack(req.body);
      res.status(201).json(pack);
    } catch (error) {
      console.error("Error creating service pack:", error);
      res.status(500).json({ error: "Failed to create service pack" });
    }
  });

  app.patch("/api/service-packs/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const pack = await storage.updateServicePack(req.params.id, req.body);
      if (!pack) {
        return res.status(404).json({ error: "Service pack not found" });
      }
      res.json(pack);
    } catch (error) {
      console.error("Error updating service pack:", error);
      res.status(500).json({ error: "Failed to update service pack" });
    }
  });

  app.delete("/api/service-packs/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      await storage.deleteServicePack(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting service pack:", error);
      res.status(500).json({ error: "Failed to delete service pack" });
    }
  });

  app.get("/api/service-packs/:id/items", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin, vendor, and vendor_designer to read service pack items
      if (!sessionUser || !["admin", "vendor", "vendor_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const items = await storage.getServicePackItems(req.params.id);
      res.json(items);
    } catch (error) {
      console.error("Error fetching service pack items:", error);
      res.status(500).json({ error: "Failed to fetch service pack items" });
    }
  });

  app.post("/api/service-packs/:id/items", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const item = await storage.addServicePackItem({ ...req.body, packId: req.params.id });
      res.status(201).json(item);
    } catch (error) {
      console.error("Error adding service pack item:", error);
      res.status(500).json({ error: "Failed to add service pack item" });
    }
  });

  app.delete("/api/service-packs/:id/items/:itemId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      await storage.removeServicePackItem(req.params.itemId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing service pack item:", error);
      res.status(500).json({ error: "Failed to remove service pack item" });
    }
  });

  // ==================== INPUT FIELDS ROUTES ====================

  // Get all input fields (admin and internal_designer)
  app.get("/api/input-fields", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin and internal_designer to view input fields
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const fields = await storage.getAllInputFields();
      res.json(fields);
    } catch (error) {
      console.error("Error fetching input fields:", error);
      res.status(500).json({ error: "Failed to fetch input fields" });
    }
  });

  // Get single input field (admin and internal_designer)
  app.get("/api/input-fields/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin and internal_designer to view input field details
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const field = await storage.getInputField(req.params.id);
      if (!field) {
        return res.status(404).json({ error: "Input field not found" });
      }
      res.json(field);
    } catch (error) {
      console.error("Error fetching input field:", error);
      res.status(500).json({ error: "Failed to fetch input field" });
    }
  });

  // Create input field (admin and internal_designer)
  app.post("/api/input-fields", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const field = await storage.createInputField(req.body);
      res.status(201).json(field);
    } catch (error) {
      console.error("Error creating input field:", error);
      res.status(500).json({ error: "Failed to create input field" });
    }
  });

  // Update input field (admin and internal_designer)
  app.patch("/api/input-fields/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const field = await storage.updateInputField(req.params.id, req.body);
      if (!field) {
        return res.status(404).json({ error: "Input field not found" });
      }
      res.json(field);
    } catch (error) {
      console.error("Error updating input field:", error);
      res.status(500).json({ error: "Failed to update input field" });
    }
  });

  // Delete input field (admin and internal_designer)
  app.delete("/api/input-fields/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      await storage.deleteInputField(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting input field:", error);
      res.status(500).json({ error: "Failed to delete input field" });
    }
  });

  // Get input field with service usage info (admin and internal_designer)
  app.get("/api/input-fields/:id/usage", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin and internal_designer to view input field usage
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const serviceFieldsList = await storage.getServiceFieldsByInputField(req.params.id);
      const allServices = await storage.getAllServices();
      const usage = await Promise.all(serviceFieldsList.map(async (sf) => {
        const service = allServices.find(s => s.id === sf.serviceId);
        return {
          serviceFieldId: sf.id,
          serviceId: sf.serviceId,
          serviceName: service?.title || "Unknown",
          required: sf.required,
          optionsJson: sf.optionsJson,
          defaultValue: sf.defaultValue,
        };
      }));
      res.json(usage);
    } catch (error) {
      console.error("Error fetching input field usage:", error);
      res.status(500).json({ error: "Failed to fetch input field usage" });
    }
  });

  // ==================== SERVICE FIELDS ROUTES ====================

  // Get service fields for a service (admin and internal_designer)
  app.get("/api/services/:serviceId/fields", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin and internal_designer to view service fields
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const fields = await storage.getServiceFields(req.params.serviceId);
      res.json(fields);
    } catch (error) {
      console.error("Error fetching service fields:", error);
      res.status(500).json({ error: "Failed to fetch service fields" });
    }
  });

  // Add field to service (admin and internal_designer)
  app.post("/api/services/:serviceId/fields", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const field = await storage.createServiceField({ ...req.body, serviceId: req.params.serviceId });
      res.status(201).json(field);
    } catch (error) {
      console.error("Error creating service field:", error);
      res.status(500).json({ error: "Failed to create service field" });
    }
  });

  // Update service field (admin and internal_designer)
  app.patch("/api/service-fields/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const field = await storage.updateServiceField(req.params.id, req.body);
      if (!field) {
        return res.status(404).json({ error: "Service field not found" });
      }
      res.json(field);
    } catch (error) {
      console.error("Error updating service field:", error);
      res.status(500).json({ error: "Failed to update service field" });
    }
  });

  // Delete service field (admin and internal_designer)
  app.delete("/api/service-fields/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      await storage.deleteServiceField(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting service field:", error);
      res.status(500).json({ error: "Failed to delete service field" });
    }
  });

  // ==================== LINE ITEM FIELDS ROUTES ====================

  // Get line item fields for a line item (admin and internal_designer)
  app.get("/api/line-items/:lineItemId/fields", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin and internal_designer to view line item fields
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const fields = await storage.getLineItemFields(req.params.lineItemId);
      res.json(fields);
    } catch (error) {
      console.error("Error fetching line item fields:", error);
      res.status(500).json({ error: "Failed to fetch line item fields" });
    }
  });

  // Add field to line item (admin and internal_designer)
  app.post("/api/line-items/:lineItemId/fields", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const field = await storage.createLineItemField({ ...req.body, lineItemId: req.params.lineItemId });
      res.status(201).json(field);
    } catch (error) {
      console.error("Error creating line item field:", error);
      res.status(500).json({ error: "Failed to create line item field" });
    }
  });

  // Update line item field (admin and internal_designer)
  app.patch("/api/line-item-fields/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const field = await storage.updateLineItemField(req.params.id, req.body);
      if (!field) {
        return res.status(404).json({ error: "Line item field not found" });
      }
      res.json(field);
    } catch (error) {
      console.error("Error updating line item field:", error);
      res.status(500).json({ error: "Failed to update line item field" });
    }
  });

  // Delete line item field (admin and internal_designer)
  app.delete("/api/line-item-fields/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      await storage.deleteLineItemField(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting line item field:", error);
      res.status(500).json({ error: "Failed to delete line item field" });
    }
  });

  // Get line item field usage by input field (admin and internal_designer)
  app.get("/api/input-fields/:id/line-item-usage", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin and internal_designer to view line item field usage
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const lineItemFieldsList = await storage.getLineItemFieldsByInputField(req.params.id);
      const allLineItems = await storage.getAllBundleLineItems();
      const usage = await Promise.all(lineItemFieldsList.map(async (lif) => {
        const lineItem = allLineItems.find(li => li.id === lif.lineItemId);
        return {
          lineItemFieldId: lif.id,
          lineItemId: lif.lineItemId,
          lineItemName: lineItem?.name || "Unknown",
          required: lif.required,
          optionsJson: lif.optionsJson,
          defaultValue: lif.defaultValue,
        };
      }));
      res.json(usage);
    } catch (error) {
      console.error("Error fetching input field line item usage:", error);
      res.status(500).json({ error: "Failed to fetch input field line item usage" });
    }
  });

  // ==================== BUNDLE FIELDS ROUTES ====================

  // Get bundle fields for a bundle (admin and internal_designer)
  app.get("/api/bundles/:bundleId/fields", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin and internal_designer to view bundle fields
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const bundleFields = await storage.getBundleFields(req.params.bundleId);
      res.json(bundleFields);
    } catch (error) {
      console.error("Error fetching bundle fields:", error);
      res.status(500).json({ error: "Failed to fetch bundle fields" });
    }
  });

  // Create bundle field (admin and internal_designer)
  app.post("/api/bundles/:bundleId/fields", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const bundleField = await storage.createBundleField({ ...req.body, bundleId: req.params.bundleId });
      res.status(201).json(bundleField);
    } catch (error) {
      console.error("Error creating bundle field:", error);
      res.status(500).json({ error: "Failed to create bundle field" });
    }
  });

  // Update bundle field (admin and internal_designer)
  app.patch("/api/bundle-fields/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const bundleField = await storage.updateBundleField(req.params.id, req.body);
      if (!bundleField) {
        return res.status(404).json({ error: "Bundle field not found" });
      }
      res.json(bundleField);
    } catch (error) {
      console.error("Error updating bundle field:", error);
      res.status(500).json({ error: "Failed to update bundle field" });
    }
  });

  // Delete bundle field (admin and internal_designer)
  app.delete("/api/bundle-fields/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      await storage.deleteBundleField(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting bundle field:", error);
      res.status(500).json({ error: "Failed to delete bundle field" });
    }
  });

  // Get bundle field usage for an input field (admin and internal_designer)
  app.get("/api/input-fields/:id/bundle-usage", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      // Allow admin and internal_designer to view bundle field usage
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }
      const bundleFieldsList = await storage.getBundleFieldsByInputField(req.params.id);
      const allBundles = await storage.getAllBundles();
      const usage = await Promise.all(bundleFieldsList.map(async (bf) => {
        const bundle = allBundles.find(b => b.id === bf.bundleId);
        return {
          bundleFieldId: bf.id,
          bundleId: bf.bundleId,
          bundleName: bundle?.name || "Unknown",
          required: bf.required,
          optionsJson: bf.optionsJson,
          defaultValue: bf.defaultValue,
        };
      }));
      res.json(usage);
    } catch (error) {
      console.error("Error fetching input field bundle usage:", error);
      res.status(500).json({ error: "Failed to fetch input field bundle usage" });
    }
  });

  // ==================== VENDOR BUNDLE/PACK COSTS ====================

  // Get all vendor bundle costs (for reports - admin only)
  app.get("/api/vendor-bundle-costs", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const costs = await storage.getAllVendorBundleCosts();
      res.json(costs);
    } catch (error) {
      console.error("Error fetching all vendor bundle costs:", error);
      res.status(500).json({ error: "Failed to fetch vendor bundle costs" });
    }
  });

  // Get vendor bundle costs for a specific vendor
  app.get("/api/vendors/:vendorId/bundle-costs", async (req, res) => {
    try {
      const costs = await storage.getVendorBundleCosts(req.params.vendorId);
      res.json(costs);
    } catch (error) {
      console.error("Error fetching vendor bundle costs:", error);
      res.status(500).json({ error: "Failed to fetch vendor bundle costs" });
    }
  });

  // Upsert vendor bundle cost
  app.put("/api/vendors/:vendorId/bundle-costs/:bundleId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      // Only vendor themselves, admin, or internal_designer can update costs
      const isVendorItself = sessionUser.role === "vendor" && sessionUser.id === req.params.vendorId;
      const isAdmin = sessionUser.role === "admin";
      const isInternalDesigner = sessionUser.role === "internal_designer";
      if (!isVendorItself && !isAdmin && !isInternalDesigner) {
        return res.status(403).json({ error: "Access denied" });
      }
      const { cost } = req.body;
      const result = await storage.upsertVendorBundleCost(req.params.vendorId, req.params.bundleId, cost);
      res.json(result);
    } catch (error) {
      console.error("Error upserting vendor bundle cost:", error);
      res.status(500).json({ error: "Failed to update vendor bundle cost" });
    }
  });

  // Get vendor pack costs for a specific vendor
  app.get("/api/vendors/:vendorId/pack-costs", async (req, res) => {
    try {
      const costs = await storage.getVendorPackCosts(req.params.vendorId);
      res.json(costs);
    } catch (error) {
      console.error("Error fetching vendor pack costs:", error);
      res.status(500).json({ error: "Failed to fetch vendor pack costs" });
    }
  });

  // Upsert vendor pack cost
  app.put("/api/vendors/:vendorId/pack-costs/:packId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      // Only vendor themselves, admin, or internal_designer can update costs
      const isVendorItself = sessionUser.role === "vendor" && sessionUser.id === req.params.vendorId;
      const isAdmin = sessionUser.role === "admin";
      const isInternalDesigner = sessionUser.role === "internal_designer";
      if (!isVendorItself && !isAdmin && !isInternalDesigner) {
        return res.status(403).json({ error: "Access denied" });
      }
      const { cost } = req.body;
      const result = await storage.upsertVendorPackCost(req.params.vendorId, req.params.packId, cost);
      res.json(result);
    } catch (error) {
      console.error("Error upserting vendor pack cost:", error);
      res.status(500).json({ error: "Failed to update vendor pack cost" });
    }
  });

  // ==================== BUNDLE REQUEST ROUTES ====================

  // Get all bundle requests (filtered by user role)
  app.get("/api/bundle-requests", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      const { status } = req.query;
      
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      let requests: any[] = [];

      // Filter requests based on user's role hierarchy
      // admin, internal_designer can see all requests
      // vendor, vendor_designer see jobs assigned to their vendor organization
      // client can only see their own requests
      if (sessionUser.role === "client") {
        // Clients can only see their own requests
        requests = await storage.getBundleRequestsByUser(sessionUserId);
      } else if (["admin", "internal_designer", "designer"].includes(sessionUser.role)) {
        // Admin, Internal Designers can see all requests
        if (status) {
          requests = await storage.getBundleRequestsByStatus(status as string);
        } else {
          requests = await storage.getAllBundleRequests();
        }
      } else if (["vendor", "vendor_designer"].includes(sessionUser.role)) {
        // Vendors and Vendor Designers see jobs assigned to their vendor organization
        const vendorId = sessionUser.role === "vendor" ? sessionUser.id : sessionUser.vendorId;
        if (vendorId) {
          const allRequests = status 
            ? await storage.getBundleRequestsByStatus(status as string)
            : await storage.getAllBundleRequests();
          
          // Prefetch all users to avoid N+1 queries
          const allUsers = await storage.getAllUsers();
          const userMap = new Map(allUsers.map(u => [u.id, u]));
          
          // Filter to show jobs assigned to this vendor organization:
          // 1. vendorAssigneeId matches the vendor
          // 2. assigneeId is the current user
          // 3. assigneeId is a vendor_designer belonging to this vendor
          requests = allRequests.filter(r => {
            if (r.vendorAssigneeId === vendorId) return true;
            if (r.assigneeId === sessionUserId) return true;
            if (r.assigneeId) {
              const assignee = userMap.get(r.assigneeId);
              if (assignee?.vendorId === vendorId) return true;
            }
            return false;
          });
        } else {
          requests = [];
        }
      }

      res.json(requests);
    } catch (error) {
      console.error("Error fetching bundle requests:", error);
      res.status(500).json({ error: "Failed to fetch bundle requests" });
    }
  });

  // Get single bundle request
  app.get("/api/bundle-requests/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const request = await storage.getBundleRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Bundle request not found" });
      }

      // Clients can only view their own requests
      if (sessionUser.role === "client" && request.userId !== sessionUserId) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(request);
    } catch (error) {
      console.error("Error fetching bundle request:", error);
      res.status(500).json({ error: "Failed to fetch bundle request" });
    }
  });

  // Create bundle request
  app.post("/api/bundle-requests", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Get session user to check role for assigneeId permission
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const requestData = {
        ...req.body,
        userId: sessionUserId,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      };

      // Only admin and internal_designer can set assigneeId during creation
      if (!["admin", "internal_designer"].includes(sessionUser.role)) {
        delete requestData.assigneeId;
      }

      const request = await storage.createBundleRequest(requestData);
      res.status(201).json(request);
    } catch (error) {
      console.error("Error creating bundle request:", error);
      res.status(500).json({ error: "Failed to create bundle request", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // Update bundle request
  app.patch("/api/bundle-requests/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const existingRequest = await storage.getBundleRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Bundle request not found" });
      }

      // Only admins, internal_designers, or the original requester can update
      const isAdmin = sessionUser.role === "admin";
      const isInternalDesigner = sessionUser.role === "internal_designer";
      const isOwner = existingRequest.userId === sessionUserId;
      const isAssignee = existingRequest.assigneeId === sessionUserId;

      if (!isAdmin && !isInternalDesigner && !isOwner && !isAssignee) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updateData = { ...req.body };
      if (req.body.dueDate) {
        updateData.dueDate = new Date(req.body.dueDate);
      }

      const request = await storage.updateBundleRequest(req.params.id, updateData);
      res.json(request);
    } catch (error) {
      console.error("Error updating bundle request:", error);
      res.status(500).json({ error: "Failed to update bundle request" });
    }
  });

  // Assign designer to bundle request with role-based permissions
  // Admin → Vendor, Internal Designer, Vendor Designer
  // Internal Designer → Vendor, Vendor Designer, other Internal Designers
  // Vendor → Vendor Designer, other Vendors (same Vendor Profile)
  // Vendor Designer → other Vendor Designers (same profile)
  app.post("/api/bundle-requests/:id/assign", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Check if user has a role that can assign at all
      if (!["admin", "internal_designer", "vendor", "vendor_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "You don't have permission to assign jobs" });
      }

      const { assigneeId } = req.body;
      if (!assigneeId) {
        return res.status(400).json({ error: "assigneeId is required" });
      }

      // Verify target user exists
      const targetUser = await storage.getUser(assigneeId);
      if (!targetUser) {
        return res.status(404).json({ error: "Target user not found" });
      }

      // Check role-based assignment permissions
      const assignmentCheck = await canAssignTo(sessionUser, targetUser);
      if (!assignmentCheck.allowed) {
        return res.status(403).json({ error: assignmentCheck.reason || "You cannot assign to this user" });
      }

      const request = await storage.assignBundleDesigner(req.params.id, assigneeId);
      if (!request) {
        return res.status(404).json({ error: "Bundle request not found" });
      }

      res.json(request);
    } catch (error) {
      console.error("Error assigning designer to bundle request:", error);
      res.status(500).json({ error: "Failed to assign designer" });
    }
  });

  // Assign bundle request to vendor (without specific designer - keeps status as pending)
  app.post("/api/bundle-requests/:id/assign-vendor", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Only admin and internal_designer can assign to vendors
      if (!["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Only admins and internal designers can assign jobs to vendors" });
      }

      const existingRequest = await storage.getBundleRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Bundle request not found" });
      }

      // Only allow vendor assignment when status is pending
      if (existingRequest.status !== "pending") {
        return res.status(400).json({ error: "Can only assign vendors to pending requests" });
      }

      const { vendorId } = req.body;
      if (!vendorId) {
        return res.status(400).json({ error: "vendorId is required" });
      }

      // Verify target vendor exists and is a vendor role
      const targetVendor = await storage.getUser(vendorId);
      if (!targetVendor) {
        return res.status(404).json({ error: "Vendor not found" });
      }
      if (targetVendor.role !== "vendor") {
        return res.status(400).json({ error: "Target user must be a vendor" });
      }

      // Assign to vendor (keeps status as pending, doesn't assign a specific designer)
      const request = await storage.assignBundleVendor(req.params.id, vendorId);
      res.json(request);
    } catch (error) {
      console.error("Error assigning vendor to bundle request:", error);
      res.status(500).json({ error: "Failed to assign vendor" });
    }
  });

  // Deliver bundle request
  app.post("/api/bundle-requests/:id/deliver", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const existingRequest = await storage.getBundleRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Bundle request not found" });
      }

      // Only the assigned designer, vendor, admin, or internal_designer can deliver
      const isAdmin = sessionUser.role === "admin";
      const isInternalDesigner = sessionUser.role === "internal_designer";
      const isVendor = sessionUser.role === "vendor";
      const isVendorDesigner = sessionUser.role === "vendor_designer";
      const isAssignee = existingRequest.assigneeId === sessionUserId;
      const isVendorAssignee = existingRequest.vendorAssigneeId === sessionUserId;

      if (!isAdmin && !isInternalDesigner && !isVendor && !isVendorDesigner && !isAssignee && !isVendorAssignee) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { finalStoreUrl } = req.body || {};
      const request = await storage.deliverBundleRequest(req.params.id, sessionUserId, finalStoreUrl);
      res.json(request);
    } catch (error) {
      console.error("Error delivering bundle request:", error);
      res.status(500).json({ error: "Failed to deliver bundle request" });
    }
  });

  // Request change on bundle request
  app.post("/api/bundle-requests/:id/change-request", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const existingRequest = await storage.getBundleRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Bundle request not found" });
      }

      // Clients can only request changes on their own requests
      if (sessionUser.role === "client" && existingRequest.userId !== sessionUserId) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { changeNote } = req.body;
      if (!changeNote) {
        return res.status(400).json({ error: "changeNote is required" });
      }

      const request = await storage.requestBundleChange(req.params.id, changeNote);
      res.json(request);
    } catch (error) {
      console.error("Error requesting change on bundle request:", error);
      res.status(500).json({ error: "Failed to request change" });
    }
  });

  // Get bundle request attachments
  app.get("/api/bundle-requests/:id/attachments", async (req, res) => {
    try {
      const attachments = await storage.getBundleRequestAttachments(req.params.id);
      res.json(attachments);
    } catch (error) {
      console.error("Error fetching bundle request attachments:", error);
      res.status(500).json({ error: "Failed to fetch attachments" });
    }
  });

  // Create bundle request attachment
  app.post("/api/bundle-requests/:id/attachments", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const attachment = await storage.createBundleRequestAttachment({
        ...req.body,
        requestId: req.params.id,
        uploadedBy: sessionUserId,
      });
      res.status(201).json(attachment);
    } catch (error) {
      console.error("Error creating bundle request attachment:", error);
      res.status(500).json({ error: "Failed to create attachment" });
    }
  });

  // Get bundle request comments
  app.get("/api/bundle-requests/:id/comments", async (req, res) => {
    try {
      const comments = await storage.getBundleRequestComments(req.params.id);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching bundle request comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  // Create bundle request comment
  app.post("/api/bundle-requests/:id/comments", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const comment = await storage.createBundleRequestComment({
        ...req.body,
        requestId: req.params.id,
        authorId: sessionUserId,
      });
      res.status(201).json(comment);
    } catch (error) {
      console.error("Error creating bundle request comment:", error);
      res.status(500).json({ error: "Failed to create comment" });
    }
  });

  // Get bundle form structure for a specific bundle (for client form)
  // This returns the bundle, its services, service fields, and bundle-level fields
  app.get("/api/bundles/:id/form-structure", async (req, res) => {
    try {
      const bundle = await storage.getBundle(req.params.id);
      if (!bundle) {
        return res.status(404).json({ error: "Bundle not found" });
      }

      // Get bundle items (services in this bundle)
      const bundleItems = await storage.getBundleItems(req.params.id);

      // Get bundle-level fields (fields assigned directly to this bundle)
      const bundleFieldsList = await storage.getBundleFields(req.params.id);
      const enrichedBundleFields = await Promise.all(
        bundleFieldsList.map(async (bf) => {
          const inputField = await storage.getInputField(bf.inputFieldId);
          return {
            ...bf,
            inputField,
          };
        })
      );

      // For each service in the bundle, get its fields
      const servicesWithFields = await Promise.all(
        bundleItems.map(async (item) => {
          if (!item.serviceId) return null;
          const service = await storage.getService(item.serviceId);
          if (!service) return null;

          const serviceFields = await storage.getServiceFields(item.serviceId);
          
          // Enrich each field with input field details
          const enrichedFields = await Promise.all(
            serviceFields.map(async (sf) => {
              const inputField = await storage.getInputField(sf.inputFieldId);
              return {
                ...sf,
                inputField,
              };
            })
          );

          // Filter out fields where:
          // 1. showOnBundleForm is false (field should only appear in bundle header)
          // 2. defaultValue is set (field has a preset value and doesn't need user input)
          const filteredFields = enrichedFields.filter((f) => {
            if (!f.inputField) return true;
            // Hide if showOnBundleForm is explicitly false
            if (f.inputField.showOnBundleForm === false) return false;
            // Hide if this service field has a default value configured
            if (f.defaultValue && typeof f.defaultValue === "string" && f.defaultValue.trim() !== "") return false;
            return true;
          });

          return {
            bundleItemId: item.id,
            serviceId: item.serviceId,
            service,
            fields: filteredFields,
            allFields: enrichedFields, // Keep all fields for reference if needed
          };
        })
      );

      res.json({
        bundle,
        bundleFields: enrichedBundleFields,
        services: servicesWithFields.filter(Boolean),
      });
    } catch (error) {
      console.error("Error fetching bundle form structure:", error);
      res.status(500).json({ error: "Failed to fetch bundle form structure" });
    }
  });

  // Get full bundle request detail (for admin/designer view)
  // This includes all fields with values, line item fields, bundle-level fields, etc.
  app.get("/api/bundle-requests/:id/full-detail", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Only admins, internal_designers, vendors, vendor_designers can see full detail
      if (!["admin", "internal_designer", "vendor", "vendor_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const request = await storage.getBundleRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Bundle request not found" });
      }

      const bundle = await storage.getBundle(request.bundleId);
      if (!bundle) {
        return res.status(404).json({ error: "Bundle not found" });
      }

      // Get bundle items
      const bundleItems = await storage.getBundleItems(request.bundleId);

      // Get bundle-level fields
      const bundleFieldsList = await storage.getBundleFields(request.bundleId);
      const formData = request.formData as Record<string, any> | null;
      const enrichedBundleFields = await Promise.all(
        bundleFieldsList.map(async (bf) => {
          const inputField = await storage.getInputField(bf.inputFieldId);
          const value = formData?.[`bundle_${bf.id}`] ?? bf.defaultValue;
          return {
            ...bf,
            inputField,
            value,
          };
        })
      );

      // Get all line items
      const allLineItems = await storage.getAllBundleLineItems();

      // For each service in the bundle, get its fields and line item fields
      const servicesWithFields = await Promise.all(
        bundleItems.map(async (item) => {
          if (!item.serviceId) return null;
          const service = await storage.getService(item.serviceId);
          if (!service) return null;

          const serviceFields = await storage.getServiceFields(item.serviceId);

          // Enrich each field with input field details
          const enrichedFields = await Promise.all(
            serviceFields.map(async (sf) => {
              const inputField = await storage.getInputField(sf.inputFieldId);
              // Get value from formData if provided, otherwise use default
              // Frontend saves with key: ${serviceId}_${inputField.fieldKey}
              const formValue = formData?.[`${item.serviceId}_${inputField?.fieldKey}`];
              return {
                ...sf,
                inputField,
                defaultValue: sf.defaultValue,
                value: formValue ?? sf.defaultValue,
              };
            })
          );

          // Get line item fields for this service
          const lineItemFieldsForService = await Promise.all(
            allLineItems.map(async (li) => {
              const liFields = await storage.getLineItemFields(li.id);
              // Filter to fields that apply to this service (via service linking or bundle scope)
              const relevantFields = await Promise.all(
                liFields.map(async (lif) => {
                  const inputField = await storage.getInputField(lif.inputFieldId);
                  const lineItemData = request.lineItemData as Record<string, any> | null;
                  const value = lineItemData?.[`${item.serviceId}_${li.id}_${lif.id}`];
                  return {
                    ...lif,
                    inputField,
                    lineItem: li,
                    value,
                  };
                })
              );
              return relevantFields;
            })
          );

          return {
            bundleItemId: item.id,
            serviceId: item.serviceId,
            service,
            fields: enrichedFields,
            lineItemFields: lineItemFieldsForService.flat(),
          };
        })
      );

      // Get attachments and comments
      const attachments = await storage.getBundleRequestAttachments(req.params.id);
      const comments = await storage.getBundleRequestComments(req.params.id);

      // Get user info
      const requester = await storage.getUser(request.userId);
      const assignee = request.assigneeId ? await storage.getUser(request.assigneeId) : null;

      res.json({
        request,
        bundle,
        bundleFields: enrichedBundleFields,
        services: servicesWithFields.filter(Boolean),
        attachments,
        comments,
        requester,
        assignee,
      });
    } catch (error) {
      console.error("Error fetching bundle request full detail:", error);
      res.status(500).json({ error: "Failed to fetch bundle request detail" });
    }
  });

  // ==================== SEED INPUT FIELDS ROUTE ====================

  // Seed input fields from existing service forms (admin only, one-time use)
  app.post("/api/admin/seed-input-fields", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Check if already seeded
      const existingFields = await storage.getAllInputFields();
      if (existingFields.length > 0) {
        return res.status(400).json({ error: "Input fields already seeded. Clear existing fields first." });
      }

      // Define all input fields from existing service forms
      const inputFieldsToCreate = [
        { fieldKey: "artwork_file", label: "Upload Artwork File", inputType: "file", valueMode: "multiple", sortOrder: 1 },
        { fieldKey: "output_format", label: "Output Format", inputType: "dropdown", valueMode: "single", sortOrder: 2 },
        { fieldKey: "color_mode", label: "Color Mode", inputType: "dropdown", valueMode: "single", sortOrder: 3 },
        { fieldKey: "number_of_colors", label: "Number of Colors", inputType: "number", valueMode: "single", sortOrder: 4 },
        { fieldKey: "width_inches", label: "Width in Inches", inputType: "number", valueMode: "single", sortOrder: 5 },
        { fieldKey: "height_inches", label: "Height in Inches", inputType: "number", valueMode: "single", sortOrder: 6 },
        { fieldKey: "thread_colors", label: "Thread Colors", inputType: "chips", valueMode: "multiple", sortOrder: 7 },
        { fieldKey: "fabric_type", label: "Fabric Type", inputType: "dropdown", valueMode: "single", sortOrder: 8 },
        { fieldKey: "vectorization_needed", label: "Vectorization Needed", inputType: "checkbox", valueMode: "single", sortOrder: 9 },
        { fieldKey: "complexity", label: "Complexity", inputType: "dropdown", valueMode: "single", sortOrder: 10 },
        { fieldKey: "project_brief", label: "Project Brief", inputType: "textarea", valueMode: "single", sortOrder: 11 },
        { fieldKey: "reference_images", label: "Reference Images", inputType: "file", valueMode: "multiple", sortOrder: 12 },
        { fieldKey: "garment_size", label: "Garment Size", inputType: "dropdown", valueMode: "single", sortOrder: 13 },
        { fieldKey: "bleed_margin", label: "Bleed Margin", inputType: "dropdown", valueMode: "single", sortOrder: 14 },
        { fieldKey: "front_back_both", label: "Front / Back / Both", inputType: "dropdown", valueMode: "single", sortOrder: 15 },
        { fieldKey: "composition_notes", label: "Composition Notes", inputType: "textarea", valueMode: "single", sortOrder: 16 },
        { fieldKey: "number_of_designs", label: "Number of Designs", inputType: "number", valueMode: "single", sortOrder: 17 },
        { fieldKey: "store_url", label: "Store URL", inputType: "url", valueMode: "single", sortOrder: 18 },
        { fieldKey: "amount_of_products", label: "Amount of Products", inputType: "number", valueMode: "single", sortOrder: 19 },
        { fieldKey: "supplier_preference", label: "Supplier Preference", inputType: "dropdown", valueMode: "single", sortOrder: 20 },
        { fieldKey: "blank_url", label: "Blank Product URL", inputType: "url", valueMode: "single", sortOrder: 21 },
        { fieldKey: "flyer_size", label: "Flyer Size", inputType: "dropdown", valueMode: "single", sortOrder: 22 },
        { fieldKey: "orientation", label: "Orientation", inputType: "dropdown", valueMode: "single", sortOrder: 23 },
        { fieldKey: "banner_type", label: "Banner Type", inputType: "dropdown", valueMode: "single", sortOrder: 24 },
        { fieldKey: "special_instructions", label: "Special Instructions", inputType: "textarea", valueMode: "single", sortOrder: 25 },
        { fieldKey: "job_notes", label: "Job Notes", inputType: "textarea", valueMode: "single", sortOrder: 26 },
      ];

      const createdFields: any[] = [];
      for (const fieldData of inputFieldsToCreate) {
        const field = await storage.createInputField(fieldData);
        createdFields.push(field);
      }

      res.status(201).json({ 
        message: `Successfully seeded ${createdFields.length} input fields`,
        fields: createdFields 
      });
    } catch (error) {
      console.error("Error seeding input fields:", error);
      res.status(500).json({ error: "Failed to seed input fields" });
    }
  });

  // ==================== VENDOR SERVICE CAPACITY ROUTES ====================

  // Get all vendor service capacities (admin/internal_designer only)
  app.get("/api/vendor-service-capacities", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const capacities = await storage.getAllVendorServiceCapacities();
      res.json(capacities);
    } catch (error) {
      console.error("Error fetching vendor service capacities:", error);
      res.status(500).json({ error: "Failed to fetch vendor service capacities" });
    }
  });

  // Get vendor service capacities for a specific vendor profile
  app.get("/api/vendor-profiles/:profileId/service-capacities", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Vendors can view their own capacities, admin/internal_designer can view all
      const profile = await storage.getVendorProfileById(req.params.profileId);
      if (!profile) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }
      
      if (!["admin", "internal_designer"].includes(sessionUser.role) && profile.userId !== sessionUserId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const capacities = await storage.getVendorServiceCapacities(req.params.profileId);
      res.json(capacities);
    } catch (error) {
      console.error("Error fetching vendor service capacities:", error);
      res.status(500).json({ error: "Failed to fetch vendor service capacities" });
    }
  });

  // Create or update vendor service capacity (upsert)
  app.post("/api/vendor-profiles/:profileId/service-capacities", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const profile = await storage.getVendorProfileById(req.params.profileId);
      if (!profile) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }
      
      // Admin can edit all; vendors can only edit their own capacities
      const isAdmin = sessionUser.role === "admin";
      const isOwner = sessionUser.role === "vendor" && profile.userId === sessionUserId;
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const { serviceId, dailyCapacity, autoAssignEnabled, priority, routingStrategy } = req.body;
      if (!serviceId) {
        return res.status(400).json({ error: "serviceId is required" });
      }
      
      const capacity = await storage.upsertVendorServiceCapacity({
        vendorProfileId: req.params.profileId,
        serviceId,
        dailyCapacity: dailyCapacity ?? 0,
        autoAssignEnabled: autoAssignEnabled ?? true,
        priority: priority ?? 0,
        routingStrategy: routingStrategy ?? "least_loaded",
      });
      
      res.status(201).json(capacity);
    } catch (error) {
      console.error("Error saving vendor service capacity:", error);
      res.status(500).json({ error: "Failed to save vendor service capacity" });
    }
  });

  // Delete vendor service capacity
  app.delete("/api/vendor-service-capacities/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "vendor"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Verify the capacity exists
      const capacity = await storage.getVendorServiceCapacityById(req.params.id);
      if (!capacity) {
        return res.status(404).json({ error: "Capacity not found" });
      }
      
      // Admin can delete any capacity
      if (sessionUser.role === "admin") {
        await storage.deleteVendorServiceCapacity(req.params.id);
        return res.status(204).send();
      }
      
      // Vendors can only delete their own capacities
      // vendorProfiles.userId references the vendor user who owns the profile
      const profile = await storage.getVendorProfileById(capacity.vendorProfileId);
      if (!profile) {
        return res.status(404).json({ error: "Vendor profile not found" });
      }
      if (profile.userId !== sessionUserId) {
        return res.status(403).json({ error: "You can only delete your own vendor capacities" });
      }
      
      await storage.deleteVendorServiceCapacity(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting vendor service capacity:", error);
      res.status(500).json({ error: "Failed to delete vendor service capacity" });
    }
  });

  // ==================== VENDOR DESIGNER CAPACITY ROUTES ====================

  // Get all vendor designer capacities (admin/internal_designer/vendor only)
  app.get("/api/vendor-designer-capacities", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer", "vendor"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      const capacities = await storage.getAllVendorDesignerCapacities();
      res.json(capacities);
    } catch (error) {
      console.error("Error fetching vendor designer capacities:", error);
      res.status(500).json({ error: "Failed to fetch vendor designer capacities" });
    }
  });

  // Get designer capacities for a specific user
  app.get("/api/users/:userId/designer-capacities", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Users can view their own capacities, admin/vendor can view their team
      const targetUser = await storage.getUser(req.params.userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const canView = 
        ["admin", "internal_designer"].includes(sessionUser.role) ||
        sessionUserId === req.params.userId ||
        (sessionUser.role === "vendor" && targetUser.vendorId === sessionUserId);
      
      if (!canView) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const capacities = await storage.getVendorDesignerCapacities(req.params.userId);
      res.json(capacities);
    } catch (error) {
      console.error("Error fetching designer capacities:", error);
      res.status(500).json({ error: "Failed to fetch designer capacities" });
    }
  });

  // Create or update designer capacity (upsert)
  app.post("/api/users/:userId/designer-capacities", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const targetUser = await storage.getUser(req.params.userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Only vendor designers and internal designers can have capacities
      if (!["vendor_designer", "internal_designer"].includes(targetUser.role)) {
        return res.status(400).json({ error: "Capacities can only be set for designers" });
      }
      
      // Admin can edit anyone, vendor can edit their designers, user can edit themselves
      const canEdit = 
        sessionUser.role === "admin" ||
        sessionUserId === req.params.userId ||
        (sessionUser.role === "vendor" && targetUser.vendorId === sessionUserId);
      
      if (!canEdit) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const { serviceId, dailyCapacity, isPrimary, autoAssignEnabled, priority } = req.body;
      if (!serviceId) {
        return res.status(400).json({ error: "serviceId is required" });
      }
      
      const capacity = await storage.upsertVendorDesignerCapacity({
        userId: req.params.userId,
        serviceId,
        dailyCapacity: dailyCapacity ?? 0,
        isPrimary: isPrimary ?? false,
        autoAssignEnabled: autoAssignEnabled ?? true,
        priority: priority ?? 0,
      });
      
      res.status(201).json(capacity);
    } catch (error) {
      console.error("Error saving designer capacity:", error);
      res.status(500).json({ error: "Failed to save designer capacity" });
    }
  });

  // Delete designer capacity
  app.delete("/api/vendor-designer-capacities/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "vendor", "vendor_designer", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Verify the capacity exists
      const capacity = await storage.getVendorDesignerCapacityById(req.params.id);
      if (!capacity) {
        return res.status(404).json({ error: "Capacity not found" });
      }
      
      // Admin can delete any capacity
      if (sessionUser.role === "admin") {
        await storage.deleteVendorDesignerCapacity(req.params.id);
        return res.status(204).send();
      }
      
      // Verify ownership based on role
      if (sessionUser.role === "vendor") {
        // Vendor can only delete capacities of their team members
        // Vendor users are identified by their user ID, and vendor_designers have vendorId pointing to the vendor's user ID
        const targetUser = await storage.getUser(capacity.userId);
        if (!targetUser) {
          return res.status(404).json({ error: "Capacity owner not found" });
        }
        // Check if target is a vendor_designer belonging to this vendor
        if (targetUser.role !== "vendor_designer" || targetUser.vendorId !== sessionUserId) {
          return res.status(403).json({ error: "You can only delete capacities for your team members" });
        }
      } else if (sessionUser.role === "vendor_designer" || sessionUser.role === "internal_designer") {
        // Designers can only delete their own capacities
        if (capacity.userId !== sessionUserId) {
          return res.status(403).json({ error: "You can only delete your own capacities" });
        }
      }
      
      await storage.deleteVendorDesignerCapacity(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting designer capacity:", error);
      res.status(500).json({ error: "Failed to delete designer capacity" });
    }
  });

  // ==================== AUTOMATION RULES ROUTES ====================

  // Get all automation rules (admin only for global, vendor for their own)
  app.get("/api/automation-rules", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      let rules;
      if (sessionUser.role === "admin") {
        // Admin sees all rules
        rules = await storage.getAllAutomationRules();
      } else if (sessionUser.role === "vendor") {
        // Vendor sees only their own rules
        rules = await storage.getAutomationRulesByOwner(sessionUserId);
      } else {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(rules);
    } catch (error) {
      console.error("Error fetching automation rules:", error);
      res.status(500).json({ error: "Failed to fetch automation rules" });
    }
  });

  // Get automation rules by scope (admin only)
  app.get("/api/automation-rules/scope/:scope", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const rules = await storage.getAutomationRulesByScope(req.params.scope);
      res.json(rules);
    } catch (error) {
      console.error("Error fetching automation rules by scope:", error);
      res.status(500).json({ error: "Failed to fetch automation rules" });
    }
  });

  // Get single automation rule
  app.get("/api/automation-rules/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const rule = await storage.getAutomationRule(req.params.id);
      if (!rule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      
      // Check access: admin can see all, vendor can see their own
      if (sessionUser.role !== "admin" && rule.ownerVendorId !== sessionUserId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(rule);
    } catch (error) {
      console.error("Error fetching automation rule:", error);
      res.status(500).json({ error: "Failed to fetch automation rule" });
    }
  });

  // Create automation rule
  app.post("/api/automation-rules", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const { scope, name, isActive, priority, serviceIds, routingTarget, routingStrategy, 
              allowedVendorIds, excludedVendorIds, fallbackAction, matchCriteria, ownerVendorId } = req.body;
      
      // Validate access
      if (scope === "global" && sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only admin can create global rules" });
      }
      
      if (scope === "vendor" && sessionUser.role !== "admin" && sessionUser.role !== "vendor") {
        return res.status(403).json({ error: "Only admin or vendor can create vendor rules" });
      }
      
      // For vendor scope, set ownerVendorId appropriately
      const finalOwnerVendorId = scope === "vendor" 
        ? (sessionUser.role === "admin" ? ownerVendorId : sessionUserId)
        : null;
      
      const rule = await storage.createAutomationRule({
        name: name || "New Rule",
        scope: scope || "global",
        ownerVendorId: finalOwnerVendorId,
        isActive: isActive ?? true,
        priority: priority ?? 0,
        serviceIds: serviceIds || null,
        routingTarget: routingTarget || "vendor_only",
        routingStrategy: routingStrategy || "least_loaded",
        allowedVendorIds: allowedVendorIds || null,
        excludedVendorIds: excludedVendorIds || null,
        fallbackAction: fallbackAction || "leave_pending",
        matchCriteria: matchCriteria || null,
        createdBy: sessionUserId,
      });
      
      res.status(201).json(rule);
    } catch (error) {
      console.error("Error creating automation rule:", error);
      res.status(500).json({ error: "Failed to create automation rule" });
    }
  });

  // Update automation rule
  app.patch("/api/automation-rules/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const existingRule = await storage.getAutomationRule(req.params.id);
      if (!existingRule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      
      // Check access
      if (sessionUser.role !== "admin" && existingRule.ownerVendorId !== sessionUserId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // For non-admin users, restrict which fields can be updated
      let allowedUpdate = req.body;
      if (sessionUser.role !== "admin") {
        // Vendors cannot change scope, ownerVendorId, createdBy, or global-only fields
        const { scope, ownerVendorId, createdBy, allowedVendorIds, excludedVendorIds, ...vendorAllowedFields } = req.body;
        allowedUpdate = vendorAllowedFields;
        
        // Prevent vendors from elevating scope
        if (scope && scope !== existingRule.scope) {
          return res.status(403).json({ error: "Cannot change rule scope" });
        }
        if (ownerVendorId && ownerVendorId !== existingRule.ownerVendorId) {
          return res.status(403).json({ error: "Cannot change rule owner" });
        }
      }
      
      const rule = await storage.updateAutomationRule(req.params.id, allowedUpdate);
      res.json(rule);
    } catch (error) {
      console.error("Error updating automation rule:", error);
      res.status(500).json({ error: "Failed to update automation rule" });
    }
  });

  // Delete automation rule
  app.delete("/api/automation-rules/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const existingRule = await storage.getAutomationRule(req.params.id);
      if (!existingRule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      
      // Check access
      if (sessionUser.role !== "admin" && existingRule.ownerVendorId !== sessionUserId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      await storage.deleteAutomationRule(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting automation rule:", error);
      res.status(500).json({ error: "Failed to delete automation rule" });
    }
  });

  // ==================== GLOBAL SEARCH ROUTES ====================

  // Search for jobs by Job ID (A-XXXXX for ad-hoc, B-XXXXX for bundle)
  app.get("/api/search/jobs", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      
      const query = (req.query.q as string || "").trim().toUpperCase();
      if (!query) {
        return res.json({ results: [] });
      }
      
      // Parse job ID format: A-XXXXX (ad-hoc) or B-XXXXX (bundle)
      const match = query.match(/^([AB])-?([A-Z0-9]+)$/i);
      if (!match) {
        return res.json({ results: [] });
      }
      
      const type = match[1].toUpperCase();
      const idPrefix = match[2].toLowerCase();
      
      const results: Array<{
        id: string;
        jobId: string;
        type: "adhoc" | "bundle";
        title: string;
      }> = [];
      
      if (type === "A") {
        // Search ad-hoc service requests
        const allRequests = await storage.getAllServiceRequests();
        const filtered = allRequests.filter(r => 
          r.id.toLowerCase().startsWith(idPrefix)
        );
        
        // Apply role-based filtering
        for (const request of filtered.slice(0, 10)) {
          let canView = false;
          
          if (sessionUser.role === "admin" || sessionUser.role === "internal_designer") {
            canView = true;
          } else if (sessionUser.role === "vendor") {
            canView = request.vendorAssigneeId === sessionUserId;
          } else if (sessionUser.role === "vendor_designer") {
            canView = request.assigneeId === sessionUserId;
          } else if (sessionUser.role === "client") {
            if (request.userId === sessionUserId) {
              canView = true;
            } else if (sessionUser.clientProfileId) {
              const requestClient = await storage.getUser(request.userId);
              canView = requestClient?.clientProfileId === sessionUser.clientProfileId;
            }
          }
          
          if (canView) {
            const service = await storage.getService(request.serviceId);
            results.push({
              id: request.id,
              jobId: `A-${request.id.slice(0, 5).toUpperCase()}`,
              type: "adhoc",
              title: service?.title || "Unknown Service"
            });
          }
        }
      } else if (type === "B") {
        // Search bundle requests
        const allBundles = await storage.getAllBundleRequests();
        const filtered = allBundles.filter(r => 
          r.id.toLowerCase().startsWith(idPrefix)
        );
        
        // Apply role-based filtering
        for (const bundle of filtered.slice(0, 10)) {
          let canView = false;
          
          if (sessionUser.role === "admin" || sessionUser.role === "internal_designer") {
            canView = true;
          } else if (sessionUser.role === "vendor") {
            canView = bundle.vendorAssigneeId === sessionUserId;
          } else if (sessionUser.role === "vendor_designer") {
            canView = bundle.assigneeId === sessionUserId;
          } else if (sessionUser.role === "client") {
            if (bundle.userId === sessionUserId) {
              canView = true;
            } else if (sessionUser.clientProfileId) {
              const bundleClient = await storage.getUser(bundle.userId);
              canView = bundleClient?.clientProfileId === sessionUser.clientProfileId;
            }
          }
          
          if (canView) {
            // Get the bundle to get the name
            const bundleInfo = await storage.getBundle(bundle.bundleId);
            results.push({
              id: bundle.id,
              jobId: `B-${bundle.id.slice(0, 5).toUpperCase()}`,
              type: "bundle",
              title: bundleInfo?.name || "Untitled Bundle"
            });
          }
        }
      }
      
      res.json({ results });
    } catch (error) {
      console.error("Error searching jobs:", error);
      res.status(500).json({ error: "Failed to search jobs" });
    }
  });

  // ==================== ADMIN DASHBOARD ROUTES ====================

  // Dashboard summary - job counts, financial metrics
  app.get("/api/admin/dashboard/summary", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { start, end } = req.query;
      const startDate = start ? new Date(start as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endDate = end ? new Date(end as string) : new Date();
      endDate.setHours(23, 59, 59, 999);

      // Get all service requests and bundle requests within date range
      const allServiceRequests = await storage.getAllServiceRequests();
      const allBundleRequests = await storage.getAllBundleRequests();
      const users = await storage.getAllUsers();
      const userMap: Record<string, typeof users[0]> = {};
      users.forEach(u => { userMap[u.id] = u; });

      // Filter by date range
      const serviceRequests = allServiceRequests.filter(r => {
        const created = new Date(r.createdAt);
        return created >= startDate && created <= endDate;
      });

      const bundleRequests = allBundleRequests.filter(r => {
        const created = new Date(r.createdAt);
        return created >= startDate && created <= endDate;
      });

      // Count jobs by admin-facing status
      const jobCounts = {
        pendingAssignment: 0,
        assignedToVendor: 0,
        inProgress: 0,
        delivered: 0,
        changeRequest: 0,
        canceled: 0,
      };

      let jobsOverSla = 0;
      const now = new Date();

      // Process service requests
      for (const r of serviceRequests) {
        const assigneeRole = r.assigneeId ? userMap[r.assigneeId]?.role : undefined;
        
        if (r.status === "pending") {
          if (!r.assigneeId && !r.vendorAssigneeId) {
            jobCounts.pendingAssignment++;
          } else if (r.vendorAssigneeId || assigneeRole === "vendor") {
            jobCounts.assignedToVendor++;
          } else {
            jobCounts.pendingAssignment++;
          }
        } else if (r.status === "in-progress") {
          jobCounts.inProgress++;
        } else if (r.status === "delivered") {
          jobCounts.delivered++;
        } else if (r.status === "change-request") {
          jobCounts.changeRequest++;
        } else if (r.status === "canceled") {
          jobCounts.canceled++;
        }

        // Check SLA - jobs over due date that are not delivered/canceled
        if (r.dueDate && r.status !== "delivered" && r.status !== "canceled") {
          if (now > new Date(r.dueDate)) {
            jobsOverSla++;
          }
        }
      }

      // Process bundle requests
      for (const r of bundleRequests) {
        const assigneeRole = r.assigneeId ? userMap[r.assigneeId]?.role : undefined;
        
        if (r.status === "pending") {
          if (!r.assigneeId && !r.vendorAssigneeId) {
            jobCounts.pendingAssignment++;
          } else if (r.vendorAssigneeId || assigneeRole === "vendor") {
            jobCounts.assignedToVendor++;
          } else {
            jobCounts.pendingAssignment++;
          }
        } else if (r.status === "in-progress") {
          jobCounts.inProgress++;
        } else if (r.status === "delivered") {
          jobCounts.delivered++;
        } else if (r.status === "change-request") {
          jobCounts.changeRequest++;
        }

        // Check SLA for bundles
        if (r.dueDate && r.status !== "delivered") {
          if (now > new Date(r.dueDate)) {
            jobsOverSla++;
          }
        }
      }

      // Calculate financial metrics
      let totalSales = 0;
      let vendorCost = 0;

      // Sum finalPrice from service requests
      for (const r of serviceRequests) {
        if (r.finalPrice) {
          totalSales += parseFloat(r.finalPrice);
        }
      }

      // Sum finalPrice from bundle requests (via bundle definition)
      const bundles = await storage.getAllBundles();
      const bundleMap: Record<string, typeof bundles[0]> = {};
      bundles.forEach(b => { bundleMap[b.id] = b; });

      for (const r of bundleRequests) {
        const bundle = bundleMap[r.bundleId];
        if (bundle?.finalPrice) {
          totalSales += parseFloat(bundle.finalPrice);
        }
      }

      // For vendor cost, we'd need vendor-specific pricing agreements
      // For now, estimate vendor cost as 60% of sales (configurable later)
      vendorCost = totalSales * 0.6;

      const profit = totalSales - vendorCost;
      const marginPercent = totalSales > 0 ? (profit / totalSales) * 100 : 0;

      // Calculate additional metrics
      const openJobs = jobCounts.pendingAssignment + jobCounts.assignedToVendor + 
                       jobCounts.inProgress + jobCounts.changeRequest;
      
      const totalOrders = serviceRequests.length + bundleRequests.length;
      const aov = totalOrders > 0 ? totalSales / totalOrders : 0;

      res.json({
        jobCounts,
        jobsOverSla,
        openJobs,
        financial: {
          totalSales,
          vendorCost,
          profit,
          marginPercent,
          aov,
        },
        totalOrders,
      });
    } catch (error) {
      console.error("Error fetching dashboard summary:", error);
      res.status(500).json({ error: "Failed to fetch dashboard summary" });
    }
  });

  // Top clients by sales
  app.get("/api/admin/dashboard/top-clients", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { start, end } = req.query;
      const startDate = start ? new Date(start as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endDate = end ? new Date(end as string) : new Date();
      endDate.setHours(23, 59, 59, 999);

      const allServiceRequests = await storage.getAllServiceRequests();
      const allBundleRequests = await storage.getAllBundleRequests();
      const users = await storage.getAllUsers();
      const bundles = await storage.getAllBundles();

      const userMap: Record<string, typeof users[0]> = {};
      users.forEach(u => { userMap[u.id] = u; });
      const bundleMap: Record<string, typeof bundles[0]> = {};
      bundles.forEach(b => { bundleMap[b.id] = b; });

      // Filter by date range
      const serviceRequests = allServiceRequests.filter(r => {
        const created = new Date(r.createdAt);
        return created >= startDate && created <= endDate;
      });
      const bundleRequests = allBundleRequests.filter(r => {
        const created = new Date(r.createdAt);
        return created >= startDate && created <= endDate;
      });

      // Aggregate by client
      const clientStats: Record<string, { requests: number; sales: number }> = {};

      for (const r of serviceRequests) {
        if (!clientStats[r.userId]) {
          clientStats[r.userId] = { requests: 0, sales: 0 };
        }
        clientStats[r.userId].requests++;
        if (r.finalPrice) {
          clientStats[r.userId].sales += parseFloat(r.finalPrice);
        }
      }

      for (const r of bundleRequests) {
        if (!clientStats[r.userId]) {
          clientStats[r.userId] = { requests: 0, sales: 0 };
        }
        clientStats[r.userId].requests++;
        const bundle = bundleMap[r.bundleId];
        if (bundle?.finalPrice) {
          clientStats[r.userId].sales += parseFloat(bundle.finalPrice);
        }
      }

      // Sort by sales and take top 10
      const topClients = Object.entries(clientStats)
        .map(([userId, stats]) => ({
          userId,
          clientName: userMap[userId]?.username || "Unknown",
          totalRequests: stats.requests,
          totalSales: stats.sales,
        }))
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 10);

      res.json(topClients);
    } catch (error) {
      console.error("Error fetching top clients:", error);
      res.status(500).json({ error: "Failed to fetch top clients" });
    }
  });

  // Top services by sales
  app.get("/api/admin/dashboard/top-services", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { start, end } = req.query;
      const startDate = start ? new Date(start as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endDate = end ? new Date(end as string) : new Date();
      endDate.setHours(23, 59, 59, 999);

      const allServiceRequests = await storage.getAllServiceRequests();
      const services = await storage.getAllServices();

      const serviceMap: Record<string, typeof services[0]> = {};
      services.forEach(s => { serviceMap[s.id] = s; });

      // Filter by date range
      const serviceRequests = allServiceRequests.filter(r => {
        const created = new Date(r.createdAt);
        return created >= startDate && created <= endDate;
      });

      // Aggregate by service
      const serviceStats: Record<string, { orders: number; sales: number }> = {};

      for (const r of serviceRequests) {
        if (!serviceStats[r.serviceId]) {
          serviceStats[r.serviceId] = { orders: 0, sales: 0 };
        }
        serviceStats[r.serviceId].orders++;
        if (r.finalPrice) {
          serviceStats[r.serviceId].sales += parseFloat(r.finalPrice);
        }
      }

      // Sort by sales and take top 10
      const topServices = Object.entries(serviceStats)
        .map(([serviceId, stats]) => ({
          serviceId,
          serviceName: serviceMap[serviceId]?.title || "Unknown",
          totalOrders: stats.orders,
          totalSales: stats.sales,
        }))
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 10);

      res.json(topServices);
    } catch (error) {
      console.error("Error fetching top services:", error);
      res.status(500).json({ error: "Failed to fetch top services" });
    }
  });

  // Top bundles by sales
  app.get("/api/admin/dashboard/top-bundles", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { start, end } = req.query;
      const startDate = start ? new Date(start as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endDate = end ? new Date(end as string) : new Date();
      endDate.setHours(23, 59, 59, 999);

      const allBundleRequests = await storage.getAllBundleRequests();
      const bundles = await storage.getAllBundles();

      const bundleMap: Record<string, typeof bundles[0]> = {};
      bundles.forEach(b => { bundleMap[b.id] = b; });

      // Filter by date range
      const bundleRequests = allBundleRequests.filter(r => {
        const created = new Date(r.createdAt);
        return created >= startDate && created <= endDate;
      });

      // Aggregate by bundle
      const bundleStats: Record<string, { orders: number; sales: number }> = {};

      for (const r of bundleRequests) {
        if (!bundleStats[r.bundleId]) {
          bundleStats[r.bundleId] = { orders: 0, sales: 0 };
        }
        bundleStats[r.bundleId].orders++;
        const bundle = bundleMap[r.bundleId];
        if (bundle?.finalPrice) {
          bundleStats[r.bundleId].sales += parseFloat(bundle.finalPrice);
        }
      }

      // Sort by sales and take top 10
      const topBundles = Object.entries(bundleStats)
        .map(([bundleId, stats]) => ({
          bundleId,
          bundleName: bundleMap[bundleId]?.name || "Unknown",
          totalOrders: stats.orders,
          totalSales: stats.sales,
        }))
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 10);

      res.json(topBundles);
    } catch (error) {
      console.error("Error fetching top bundles:", error);
      res.status(500).json({ error: "Failed to fetch top bundles" });
    }
  });

  // Daily sales trend
  app.get("/api/admin/dashboard/daily-sales", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { start, end } = req.query;
      const startDate = start ? new Date(start as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endDate = end ? new Date(end as string) : new Date();
      endDate.setHours(23, 59, 59, 999);

      const allServiceRequests = await storage.getAllServiceRequests();
      const allBundleRequests = await storage.getAllBundleRequests();
      const bundles = await storage.getAllBundles();

      const bundleMap: Record<string, typeof bundles[0]> = {};
      bundles.forEach(b => { bundleMap[b.id] = b; });

      // Aggregate by day
      const dailySales: Record<string, number> = {};

      // Initialize all days in range
      const current = new Date(startDate);
      while (current <= endDate) {
        const dateKey = current.toISOString().split('T')[0];
        dailySales[dateKey] = 0;
        current.setDate(current.getDate() + 1);
      }

      // Add service request sales
      for (const r of allServiceRequests) {
        const created = new Date(r.createdAt);
        if (created >= startDate && created <= endDate) {
          const dateKey = created.toISOString().split('T')[0];
          if (r.finalPrice) {
            dailySales[dateKey] = (dailySales[dateKey] || 0) + parseFloat(r.finalPrice);
          }
        }
      }

      // Add bundle request sales
      for (const r of allBundleRequests) {
        const created = new Date(r.createdAt);
        if (created >= startDate && created <= endDate) {
          const dateKey = created.toISOString().split('T')[0];
          const bundle = bundleMap[r.bundleId];
          if (bundle?.finalPrice) {
            dailySales[dateKey] = (dailySales[dateKey] || 0) + parseFloat(bundle.finalPrice);
          }
        }
      }

      // Convert to array sorted by date
      const result = Object.entries(dailySales)
        .map(([date, sales]) => ({ date, sales }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json(result);
    } catch (error) {
      console.error("Error fetching daily sales:", error);
      res.status(500).json({ error: "Failed to fetch daily sales" });
    }
  });

  // Daily orders trend
  app.get("/api/admin/dashboard/daily-orders", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { start, end } = req.query;
      const startDate = start ? new Date(start as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endDate = end ? new Date(end as string) : new Date();
      endDate.setHours(23, 59, 59, 999);

      const allServiceRequests = await storage.getAllServiceRequests();
      const allBundleRequests = await storage.getAllBundleRequests();

      // Aggregate by day
      const dailyOrders: Record<string, number> = {};

      // Initialize all days in range
      const current = new Date(startDate);
      while (current <= endDate) {
        const dateKey = current.toISOString().split('T')[0];
        dailyOrders[dateKey] = 0;
        current.setDate(current.getDate() + 1);
      }

      // Count service requests
      for (const r of allServiceRequests) {
        const created = new Date(r.createdAt);
        if (created >= startDate && created <= endDate) {
          const dateKey = created.toISOString().split('T')[0];
          dailyOrders[dateKey] = (dailyOrders[dateKey] || 0) + 1;
        }
      }

      // Count bundle requests
      for (const r of allBundleRequests) {
        const created = new Date(r.createdAt);
        if (created >= startDate && created <= endDate) {
          const dateKey = created.toISOString().split('T')[0];
          dailyOrders[dateKey] = (dailyOrders[dateKey] || 0) + 1;
        }
      }

      // Convert to array sorted by date
      const result = Object.entries(dailyOrders)
        .map(([date, orders]) => ({ date, orders }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json(result);
    } catch (error) {
      console.error("Error fetching daily orders:", error);
      res.status(500).json({ error: "Failed to fetch daily orders" });
    }
  });

  // ==================== ROLE-BASED DASHBOARD ROUTES ====================

  // Dashboard summary for Internal Designer, Vendor, Vendor Designer
  app.get("/api/dashboard/summary", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(403).json({ error: "User not found" });
      }

      const allowedRoles = ["admin", "internal_designer", "vendor", "vendor_designer"];
      if (!allowedRoles.includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { start, end } = req.query;
      const startDate = start ? new Date(start as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endDate = end ? new Date(end as string) : new Date();
      endDate.setHours(23, 59, 59, 999);

      const allServiceRequests = await storage.getAllServiceRequests();
      const allBundleRequests = await storage.getAllBundleRequests();
      const users = await storage.getAllUsers();
      const userMap: Record<string, typeof users[0]> = {};
      users.forEach(u => { userMap[u.id] = u; });

      // Filter requests based on role
      let filteredServiceRequests = allServiceRequests;
      let filteredBundleRequests = allBundleRequests;

      if (sessionUser.role === "vendor") {
        // Vendor sees jobs assigned to their vendor profile
        // Fallback to user id if vendorId is not set (older records)
        const vendorId = sessionUser.vendorId || sessionUser.id;
        filteredServiceRequests = allServiceRequests.filter(r => r.vendorAssigneeId === vendorId);
        filteredBundleRequests = allBundleRequests.filter(r => r.vendorAssigneeId === vendorId);
      } else if (sessionUser.role === "vendor_designer") {
        // Vendor Designer sees only jobs assigned to them personally
        filteredServiceRequests = allServiceRequests.filter(r => r.assigneeId === sessionUser.id);
        filteredBundleRequests = allBundleRequests.filter(r => r.assigneeId === sessionUser.id);
      }
      // admin and internal_designer see all jobs

      // Filter by date range
      const serviceRequests = filteredServiceRequests.filter(r => {
        const created = new Date(r.createdAt);
        return created >= startDate && created <= endDate;
      });

      const bundleRequests = filteredBundleRequests.filter(r => {
        const created = new Date(r.createdAt);
        return created >= startDate && created <= endDate;
      });

      // Count jobs by status
      const jobCounts = {
        pendingAssignment: 0,
        assignedToVendor: 0,
        inProgress: 0,
        delivered: 0,
        changeRequest: 0,
        canceled: 0,
      };

      let jobsOverSla = 0;
      const now = new Date();

      for (const r of serviceRequests) {
        const assigneeRole = r.assigneeId ? userMap[r.assigneeId]?.role : undefined;
        
        if (r.status === "pending") {
          if (!r.assigneeId && !r.vendorAssigneeId) {
            jobCounts.pendingAssignment++;
          } else if (r.vendorAssigneeId || assigneeRole === "vendor") {
            jobCounts.assignedToVendor++;
          } else {
            jobCounts.pendingAssignment++;
          }
        } else if (r.status === "in-progress") {
          jobCounts.inProgress++;
        } else if (r.status === "delivered") {
          jobCounts.delivered++;
        } else if (r.status === "change-request") {
          jobCounts.changeRequest++;
        } else if (r.status === "canceled") {
          jobCounts.canceled++;
        }

        if (r.dueDate && r.status !== "delivered" && r.status !== "canceled") {
          if (now > new Date(r.dueDate)) {
            jobsOverSla++;
          }
        }
      }

      for (const r of bundleRequests) {
        const assigneeRole = r.assigneeId ? userMap[r.assigneeId]?.role : undefined;
        
        if (r.status === "pending") {
          if (!r.assigneeId && !r.vendorAssigneeId) {
            jobCounts.pendingAssignment++;
          } else if (r.vendorAssigneeId || assigneeRole === "vendor") {
            jobCounts.assignedToVendor++;
          } else {
            jobCounts.pendingAssignment++;
          }
        } else if (r.status === "in-progress") {
          jobCounts.inProgress++;
        } else if (r.status === "delivered") {
          jobCounts.delivered++;
        } else if (r.status === "change-request") {
          jobCounts.changeRequest++;
        }

        if (r.dueDate && r.status !== "delivered") {
          if (now > new Date(r.dueDate)) {
            jobsOverSla++;
          }
        }
      }

      // Calculate financial metrics (only for admin)
      let totalSales = 0;
      let vendorCost = 0;

      if (sessionUser.role === "admin") {
        for (const r of serviceRequests) {
          if (r.finalPrice) {
            totalSales += parseFloat(r.finalPrice);
          }
        }

        const bundles = await storage.getAllBundles();
        const bundleMap: Record<string, typeof bundles[0]> = {};
        bundles.forEach(b => { bundleMap[b.id] = b; });

        for (const r of bundleRequests) {
          const bundle = bundleMap[r.bundleId];
          if (bundle?.finalPrice) {
            totalSales += parseFloat(bundle.finalPrice);
          }
        }

        vendorCost = totalSales * 0.6;
      }

      const profit = totalSales - vendorCost;
      const marginPercent = totalSales > 0 ? (profit / totalSales) * 100 : 0;
      const openJobs = jobCounts.pendingAssignment + jobCounts.assignedToVendor + 
                       jobCounts.inProgress + jobCounts.changeRequest;
      const totalOrders = serviceRequests.length + bundleRequests.length;
      const aov = totalOrders > 0 ? totalSales / totalOrders : 0;

      res.json({
        jobCounts,
        jobsOverSla,
        openJobs,
        financial: {
          totalSales,
          vendorCost,
          profit,
          marginPercent,
          aov,
        },
        totalOrders,
      });
    } catch (error) {
      console.error("Error fetching dashboard summary:", error);
      res.status(500).json({ error: "Failed to fetch dashboard summary" });
    }
  });

  // Daily orders for role-based dashboard
  app.get("/api/dashboard/daily-orders", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(403).json({ error: "User not found" });
      }

      const allowedRoles = ["admin", "internal_designer", "vendor", "vendor_designer"];
      if (!allowedRoles.includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { start, end } = req.query;
      const startDate = start ? new Date(start as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const endDate = end ? new Date(end as string) : new Date();
      endDate.setHours(23, 59, 59, 999);

      const allServiceRequests = await storage.getAllServiceRequests();
      const allBundleRequests = await storage.getAllBundleRequests();

      // Filter requests based on role
      let filteredServiceRequests = allServiceRequests;
      let filteredBundleRequests = allBundleRequests;

      if (sessionUser.role === "vendor") {
        // Fallback to user id if vendorId is not set (older records)
        const vendorId = sessionUser.vendorId || sessionUser.id;
        filteredServiceRequests = allServiceRequests.filter(r => r.vendorAssigneeId === vendorId);
        filteredBundleRequests = allBundleRequests.filter(r => r.vendorAssigneeId === vendorId);
      } else if (sessionUser.role === "vendor_designer") {
        filteredServiceRequests = allServiceRequests.filter(r => r.assigneeId === sessionUser.id);
        filteredBundleRequests = allBundleRequests.filter(r => r.assigneeId === sessionUser.id);
      }

      // Aggregate by day
      const dailyOrders: Record<string, number> = {};

      // Initialize all days in range
      const current = new Date(startDate);
      while (current <= endDate) {
        const dateKey = current.toISOString().split('T')[0];
        dailyOrders[dateKey] = 0;
        current.setDate(current.getDate() + 1);
      }

      for (const r of filteredServiceRequests) {
        const created = new Date(r.createdAt);
        if (created >= startDate && created <= endDate) {
          const dateKey = created.toISOString().split('T')[0];
          dailyOrders[dateKey] = (dailyOrders[dateKey] || 0) + 1;
        }
      }

      for (const r of filteredBundleRequests) {
        const created = new Date(r.createdAt);
        if (created >= startDate && created <= endDate) {
          const dateKey = created.toISOString().split('T')[0];
          dailyOrders[dateKey] = (dailyOrders[dateKey] || 0) + 1;
        }
      }

      const result = Object.entries(dailyOrders)
        .map(([date, orders]) => ({ date, orders }))
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json(result);
    } catch (error) {
      console.error("Error fetching daily orders:", error);
      res.status(500).json({ error: "Failed to fetch daily orders" });
    }
  });

  // ==================== AUTOMATION LOGS ROUTES ====================

  // Get automation logs for a service request
  app.get("/api/service-requests/:id/automation-logs", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const logs = await storage.getAutomationLogsByRequest(req.params.id);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching automation logs:", error);
      res.status(500).json({ error: "Failed to fetch automation logs" });
    }
  });

  // ==================== VENDOR PAYMENT REPORT ROUTES ====================

  // Get vendor payment report data
  app.get("/api/reports/vendor-payments", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(403).json({ error: "User not found" });
      }

      // Only admin and vendor can access
      if (!["admin", "vendor"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { period, vendorId } = req.query;
      const paymentPeriod = period as string || new Date().toISOString().slice(0, 7); // Default to current month YYYY-MM

      const allServiceRequests = await storage.getAllServiceRequests();
      const allBundleRequests = await storage.getAllBundleRequests();
      const allUsers = await storage.getAllUsers();
      const allServices = await storage.getAllServices();
      const allBundles = await storage.getAllBundles();
      const vendorProfiles = await storage.getAllVendorProfiles();
      const vendorBundleCosts = await storage.getAllVendorBundleCosts();

      const userMap: Record<string, typeof allUsers[0]> = {};
      allUsers.forEach(u => { userMap[u.id] = u; });
      const serviceMap: Record<string, typeof allServices[0]> = {};
      allServices.forEach(s => { serviceMap[s.id] = s; });
      const bundleMap: Record<string, typeof allBundles[0]> = {};
      allBundles.forEach(b => { bundleMap[b.id] = b; });
      const vendorProfileMap: Record<string, typeof vendorProfiles[0]> = {};
      vendorProfiles.forEach(v => { vendorProfileMap[v.userId] = v; });

      // Filter service requests:
      // 1. Must be delivered or completed
      // 2. Assignee must NOT be admin or internal_designer (these are $0 cost)
      // 3. Match payment period (use vendorPaymentPeriod if set, else deliveredAt)
      // 4. If vendor is viewing, only their jobs
      let filteredServiceRequests = allServiceRequests.filter(r => {
        // Must be delivered
        if (!["delivered"].includes(r.status) || !r.deliveredAt) return false;
        
        // Determine job period: use vendorPaymentPeriod if set, else deliveredAt
        const jobPeriod = r.vendorPaymentPeriod || new Date(r.deliveredAt).toISOString().slice(0, 7);
        if (jobPeriod !== paymentPeriod) return false;

        // Exclude if assignee is admin or internal_designer
        if (r.assigneeId) {
          const assignee = userMap[r.assigneeId];
          if (assignee && ["admin", "internal_designer"].includes(assignee.role)) return false;
        }

        return true;
      });

      let filteredBundleRequests = allBundleRequests.filter(r => {
        if (!["delivered"].includes(r.status) || !r.deliveredAt) return false;
        
        // Determine job period: use vendorPaymentPeriod if set, else deliveredAt
        const jobPeriod = r.vendorPaymentPeriod || new Date(r.deliveredAt).toISOString().slice(0, 7);
        if (jobPeriod !== paymentPeriod) return false;

        if (r.assigneeId) {
          const assignee = userMap[r.assigneeId];
          if (assignee && ["admin", "internal_designer"].includes(assignee.role)) return false;
        }

        return true;
      });

      // If vendor is viewing, filter to only their jobs
      if (sessionUser.role === "vendor") {
        const vendorUserId = sessionUser.id;
        filteredServiceRequests = filteredServiceRequests.filter(r => r.vendorAssigneeId === vendorUserId);
        filteredBundleRequests = filteredBundleRequests.filter(r => r.vendorAssigneeId === vendorUserId);
      } else if (vendorId) {
        // Admin can filter by specific vendor
        filteredServiceRequests = filteredServiceRequests.filter(r => r.vendorAssigneeId === vendorId);
        filteredBundleRequests = filteredBundleRequests.filter(r => r.vendorAssigneeId === vendorId);
      }

      // Build vendor cost lookup from vendor profiles pricing agreements
      // Priority: 1) Pricing agreement (by service title), 2) Request's vendorCost field
      const getVendorServiceCost = (vendorUserId: string, serviceId: string, serviceName: string, requestVendorCost?: string | null): number => {
        // First check pricing agreements (keyed by service title, not ID)
        const vendorProfile = vendorProfileMap[vendorUserId];
        if (vendorProfile?.pricingAgreements) {
          const agreements = vendorProfile.pricingAgreements as Record<string, { basePrice?: number | string; cost?: number | string }>;
          const agreement = agreements[serviceName];
          // Check basePrice first (primary field), then legacy cost field
          if (agreement?.basePrice !== undefined && agreement.basePrice !== null) {
            const val = typeof agreement.basePrice === 'string' ? parseFloat(agreement.basePrice) : agreement.basePrice;
            if (!isNaN(val)) return val;
          }
          // Fallback to legacy cost field
          if (agreement?.cost !== undefined && agreement.cost !== null) {
            const val = typeof agreement.cost === 'string' ? parseFloat(agreement.cost) : agreement.cost;
            if (!isNaN(val)) return val;
          }
        }
        // Fall back to stored vendorCost on the request
        if (requestVendorCost) {
          return parseFloat(requestVendorCost);
        }
        return 0;
      };

      const getVendorBundleCost = (vendorUserId: string, bundleId: string, requestVendorCost?: string | null): number => {
        // First check vendor bundle costs table
        const cost = vendorBundleCosts.find(c => c.vendorId === vendorUserId && c.bundleId === bundleId);
        if (cost) return parseFloat(cost.cost);
        // Fall back to request's vendorCost
        if (requestVendorCost) {
          return parseFloat(requestVendorCost);
        }
        return 0;
      };

      // Group by vendor
      const vendorSummaries: Record<string, {
        vendorId: string;
        vendorName: string;
        adhocJobs: { count: number; totalCost: number; services: Record<string, { count: number; unitCost: number; totalCost: number }> };
        bundleJobs: { count: number; totalCost: number; bundles: Record<string, { count: number; unitCost: number; totalCost: number }> };
        totalEarnings: number;
        pendingCount: number;
        paidCount: number;
        jobs: Array<{
          id: string;
          type: "adhoc" | "bundle";
          serviceName: string;
          vendorCost: number;
          paymentStatus: string;
          deliveredAt: Date | null;
          customerName: string | null;
        }>;
      }> = {};

      // Process service requests (ad-hoc)
      for (const r of filteredServiceRequests) {
        const vendorUserId = r.vendorAssigneeId;
        if (!vendorUserId) continue;

        const vendorProfile = vendorProfileMap[vendorUserId];
        const vendorName = vendorProfile?.companyName || userMap[vendorUserId]?.username || "Unknown Vendor";

        if (!vendorSummaries[vendorUserId]) {
          vendorSummaries[vendorUserId] = {
            vendorId: vendorUserId,
            vendorName,
            adhocJobs: { count: 0, totalCost: 0, services: {} },
            bundleJobs: { count: 0, totalCost: 0, bundles: {} },
            totalEarnings: 0,
            pendingCount: 0,
            paidCount: 0,
            jobs: [],
          };
        }

        const service = serviceMap[r.serviceId];
        const serviceName = service?.title || "Unknown Service";
        const unitCost = getVendorServiceCost(vendorUserId, r.serviceId, serviceName, r.vendorCost);

        vendorSummaries[vendorUserId].adhocJobs.count++;
        vendorSummaries[vendorUserId].adhocJobs.totalCost += unitCost;

        if (!vendorSummaries[vendorUserId].adhocJobs.services[serviceName]) {
          vendorSummaries[vendorUserId].adhocJobs.services[serviceName] = { count: 0, unitCost, totalCost: 0 };
        }
        vendorSummaries[vendorUserId].adhocJobs.services[serviceName].count++;
        vendorSummaries[vendorUserId].adhocJobs.services[serviceName].totalCost += unitCost;

        vendorSummaries[vendorUserId].totalEarnings += unitCost;

        if (r.vendorPaymentStatus === "paid") {
          vendorSummaries[vendorUserId].paidCount++;
        } else {
          vendorSummaries[vendorUserId].pendingCount++;
        }

        vendorSummaries[vendorUserId].jobs.push({
          id: r.id,
          type: "adhoc",
          serviceName,
          vendorCost: unitCost,
          paymentStatus: r.vendorPaymentStatus || "pending",
          deliveredAt: r.deliveredAt,
          customerName: r.customerName,
        });
      }

      // Process bundle requests
      for (const r of filteredBundleRequests) {
        const vendorUserId = r.vendorAssigneeId;
        if (!vendorUserId) continue;

        const vendorProfile = vendorProfileMap[vendorUserId];
        const vendorName = vendorProfile?.companyName || userMap[vendorUserId]?.username || "Unknown Vendor";

        if (!vendorSummaries[vendorUserId]) {
          vendorSummaries[vendorUserId] = {
            vendorId: vendorUserId,
            vendorName,
            adhocJobs: { count: 0, totalCost: 0, services: {} },
            bundleJobs: { count: 0, totalCost: 0, bundles: {} },
            totalEarnings: 0,
            pendingCount: 0,
            paidCount: 0,
            jobs: [],
          };
        }

        const bundle = bundleMap[r.bundleId];
        const bundleName = bundle?.name || "Unknown Bundle";
        const unitCost = getVendorBundleCost(vendorUserId, r.bundleId, r.vendorCost);

        vendorSummaries[vendorUserId].bundleJobs.count++;
        vendorSummaries[vendorUserId].bundleJobs.totalCost += unitCost;

        if (!vendorSummaries[vendorUserId].bundleJobs.bundles[bundleName]) {
          vendorSummaries[vendorUserId].bundleJobs.bundles[bundleName] = { count: 0, unitCost, totalCost: 0 };
        }
        vendorSummaries[vendorUserId].bundleJobs.bundles[bundleName].count++;
        vendorSummaries[vendorUserId].bundleJobs.bundles[bundleName].totalCost += unitCost;

        vendorSummaries[vendorUserId].totalEarnings += unitCost;

        if (r.vendorPaymentStatus === "paid") {
          vendorSummaries[vendorUserId].paidCount++;
        } else {
          vendorSummaries[vendorUserId].pendingCount++;
        }

        vendorSummaries[vendorUserId].jobs.push({
          id: r.id,
          type: "bundle",
          serviceName: bundleName,
          vendorCost: unitCost,
          paymentStatus: r.vendorPaymentStatus || "pending",
          deliveredAt: r.deliveredAt,
          customerName: null,
        });
      }

      res.json({
        period: paymentPeriod,
        vendors: Object.values(vendorSummaries),
      });
    } catch (error) {
      console.error("Error fetching vendor payment report:", error);
      res.status(500).json({ error: "Failed to fetch vendor payment report" });
    }
  });

  // Mark jobs as paid
  app.post("/api/reports/vendor-payments/mark-paid", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { jobIds, period } = req.body;
      if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
        return res.status(400).json({ error: "jobIds array required" });
      }

      const now = new Date();
      const paymentPeriod = period || now.toISOString().slice(0, 7);

      // Update service requests
      for (const jobId of jobIds) {
        // Try service request first
        const serviceRequest = await storage.getServiceRequest(jobId);
        if (serviceRequest) {
          await storage.updateServiceRequest(jobId, {
            vendorPaymentStatus: "paid",
            vendorPaymentPeriod: paymentPeriod,
            vendorPaymentMarkedAt: now,
            vendorPaymentMarkedBy: sessionUserId,
          });
          continue;
        }

        // Try bundle request
        const bundleRequest = await storage.getBundleRequest(jobId);
        if (bundleRequest) {
          await storage.updateBundleRequest(jobId, {
            vendorPaymentStatus: "paid",
            vendorPaymentPeriod: paymentPeriod,
            vendorPaymentMarkedAt: now,
            vendorPaymentMarkedBy: sessionUserId,
          });
        }
      }

      res.json({ success: true, markedCount: jobIds.length });
    } catch (error) {
      console.error("Error marking jobs as paid:", error);
      res.status(500).json({ error: "Failed to mark jobs as paid" });
    }
  });

  // Get job details for payment period (for PDF/CSV export)
  app.get("/api/reports/vendor-payments/jobs", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(403).json({ error: "User not found" });
      }

      if (!["admin", "vendor"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { period, vendorId, status } = req.query;
      const paymentPeriod = period as string || new Date().toISOString().slice(0, 7);

      const allServiceRequests = await storage.getAllServiceRequests();
      const allBundleRequests = await storage.getAllBundleRequests();
      const allUsers = await storage.getAllUsers();
      const allServices = await storage.getAllServices();
      const allBundles = await storage.getAllBundles();
      const vendorProfiles = await storage.getAllVendorProfiles();

      const userMap: Record<string, typeof allUsers[0]> = {};
      allUsers.forEach(u => { userMap[u.id] = u; });
      const serviceMap: Record<string, typeof allServices[0]> = {};
      allServices.forEach(s => { serviceMap[s.id] = s; });
      const bundleMap: Record<string, typeof allBundles[0]> = {};
      allBundles.forEach(b => { bundleMap[b.id] = b; });
      const vendorProfileMap: Record<string, typeof vendorProfiles[0]> = {};
      vendorProfiles.forEach(v => { vendorProfileMap[v.userId] = v; });

      // Filter service requests - use vendorPaymentPeriod if set, else deliveredAt
      let filteredServiceRequests = allServiceRequests.filter(r => {
        if (!["delivered"].includes(r.status) || !r.deliveredAt) return false;
        
        // Determine job period: use vendorPaymentPeriod if set, else deliveredAt
        const jobPeriod = r.vendorPaymentPeriod || new Date(r.deliveredAt).toISOString().slice(0, 7);
        if (jobPeriod !== paymentPeriod) return false;

        if (r.assigneeId) {
          const assignee = userMap[r.assigneeId];
          if (assignee && ["admin", "internal_designer"].includes(assignee.role)) return false;
        }

        if (status && r.vendorPaymentStatus !== status) return false;

        return true;
      });

      let filteredBundleRequests = allBundleRequests.filter(r => {
        if (!["delivered"].includes(r.status) || !r.deliveredAt) return false;
        
        // Determine job period: use vendorPaymentPeriod if set, else deliveredAt
        const jobPeriod = r.vendorPaymentPeriod || new Date(r.deliveredAt).toISOString().slice(0, 7);
        if (jobPeriod !== paymentPeriod) return false;

        if (r.assigneeId) {
          const assignee = userMap[r.assigneeId];
          if (assignee && ["admin", "internal_designer"].includes(assignee.role)) return false;
        }

        if (status && r.vendorPaymentStatus !== status) return false;

        return true;
      });

      // Filter by vendor
      if (sessionUser.role === "vendor") {
        filteredServiceRequests = filteredServiceRequests.filter(r => r.vendorAssigneeId === sessionUser.id);
        filteredBundleRequests = filteredBundleRequests.filter(r => r.vendorAssigneeId === sessionUser.id);
      } else if (vendorId) {
        filteredServiceRequests = filteredServiceRequests.filter(r => r.vendorAssigneeId === vendorId);
        filteredBundleRequests = filteredBundleRequests.filter(r => r.vendorAssigneeId === vendorId);
      }

      const jobs = [
        ...filteredServiceRequests.map(r => {
          const service = serviceMap[r.serviceId];
          const vendorProfile = r.vendorAssigneeId ? vendorProfileMap[r.vendorAssigneeId] : null;
          return {
            id: r.id,
            jobId: `A-${r.id.slice(0, 5).toUpperCase()}`,
            type: "Ad-hoc" as const,
            serviceName: service?.title || "Unknown Service",
            vendorName: vendorProfile?.companyName || (r.vendorAssigneeId ? userMap[r.vendorAssigneeId]?.username : null) || "Unknown",
            customerName: r.customerName,
            deliveredAt: r.deliveredAt,
            vendorCost: r.vendorCost ? parseFloat(r.vendorCost) : 0,
            paymentStatus: r.vendorPaymentStatus || "pending",
          };
        }),
        ...filteredBundleRequests.map(r => {
          const bundle = bundleMap[r.bundleId];
          const vendorProfile = r.vendorAssigneeId ? vendorProfileMap[r.vendorAssigneeId] : null;
          return {
            id: r.id,
            jobId: `B-${r.id.slice(0, 5).toUpperCase()}`,
            type: "Bundle" as const,
            serviceName: bundle?.name || "Unknown Bundle",
            vendorName: vendorProfile?.companyName || (r.vendorAssigneeId ? userMap[r.vendorAssigneeId]?.username : null) || "Unknown",
            customerName: null,
            deliveredAt: r.deliveredAt,
            vendorCost: r.vendorCost ? parseFloat(r.vendorCost) : 0,
            paymentStatus: r.vendorPaymentStatus || "pending",
          };
        }),
      ];

      // Sort by delivered date
      jobs.sort((a, b) => {
        const dateA = a.deliveredAt ? new Date(a.deliveredAt).getTime() : 0;
        const dateB = b.deliveredAt ? new Date(b.deliveredAt).getTime() : 0;
        return dateB - dateA;
      });

      res.json({ period: paymentPeriod, jobs });
    } catch (error) {
      console.error("Error fetching job details:", error);
      res.status(500).json({ error: "Failed to fetch job details" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
