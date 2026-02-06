import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { automationEngine } from "./services/automationEngine";
import { stripeService } from "./services/stripeService";
import type { User } from "@shared/schema";

/**
 * Apply Tri-POD product discount tier to a price
 * Discount tiers: none (0%), power_level (10%), oms_subscription (15%), enterprise (20%)
 * Rounds up to nearest cent
 */
function applyTripodDiscount(price: number, discountTier: string): number {
  const discountPercent = getTripodDiscountPercent(discountTier);
  
  if (discountPercent === 0) return price;
  return Math.ceil((price * (1 - discountPercent / 100)) * 100) / 100;
}

/**
 * Get the discount percentage for a Tri-POD tier
 * Used for overage billing where client discount applies to retail price
 */
function getTripodDiscountPercent(discountTier: string): number {
  return discountTier === "power_level" ? 10 :
         discountTier === "oms_subscription" ? 15 :
         discountTier === "enterprise" ? 20 : 0;
}

/**
 * Get current month and year in CST/CDT (America/Chicago) timezone for pack usage tracking
 * Uses Intl.DateTimeFormat to properly handle Daylight Saving Time
 */
function getCSTMonthYear(): { month: number; year: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'numeric'
  });
  const parts = formatter.formatToParts(now);
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '1', 10);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || String(now.getFullYear()), 10);
  return { month, year };
}

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
      return ["admin", "vendor", "internal_designer", "vendor_designer"];
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
      // client and client_member see all requests from their company (client profile)
      if (["client", "client_member"].includes(sessionUser.role)) {
        // Clients and client members see all requests from their company
        if (sessionUser.clientProfileId) {
          requests = await storage.getServiceRequestsByClientProfile(sessionUser.clientProfileId);
        } else {
          requests = await storage.getServiceRequestsByUser(sessionUserId);
        }
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

      // Clients and client members can only view requests from their company
      if (["client", "client_member"].includes(sessionUser.role)) {
        if (sessionUser.clientProfileId) {
          const teamMembers = await storage.getClientTeamMembers(sessionUser.clientProfileId);
          const teamMemberIds = teamMembers.map(u => u.id);
          if (!teamMemberIds.includes(request.userId)) {
            return res.status(403).json({ error: "Access denied" });
          }
        } else if (request.userId !== sessionUserId) {
          return res.status(403).json({ error: "Access denied" });
        }
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

      // Check if client has payment overdue - block new service requests for clients with overdue payments
      if (["client", "client_member"].includes(sessionUser.role) && sessionUser.clientProfileId) {
        const clientProfile = await storage.getClientProfileById(sessionUser.clientProfileId);
        if (clientProfile?.paymentOverdue) {
          return res.status(403).json({ 
            error: "Payment overdue. Please resolve outstanding payments before submitting new requests.",
            code: "PAYMENT_OVERDUE"
          });
        }
      }

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

      // Check for active service pack subscription for pack-based pricing
      // IMPORTANT: Monthly packs don't accumulate - unused services reset each month (like cellphone plans)
      if (sessionUser.clientProfileId && req.body.serviceId) {
        try {
          // Get service to find the parent service (father service)
          const service = await storage.getService(req.body.serviceId);
          const fatherServiceId = service?.parentServiceId || req.body.serviceId;
          
          // Get active subscriptions for this client
          const activeSubscriptions = await storage.getActiveClientPackSubscriptions(sessionUser.clientProfileId);
          
          // Find a subscription that includes this service
          for (const subscription of activeSubscriptions) {
            const pack = await storage.getServicePack(subscription.packId);
            if (pack) {
              const packItems = await storage.getServicePackItems(pack.id);
              const packService = packItems.find((item: { serviceId: string; quantity: number }) => item.serviceId === fatherServiceId);
              if (packService) {
                // Get current billing period usage - monthly packs DON'T accumulate
                const { month, year } = getCSTMonthYear();
                const currentMonthUsage = await storage.getMonthlyPackUsageBySubscription(subscription.id, month, year);
                const serviceUsage = currentMonthUsage.find(u => u.serviceId === fatherServiceId);
                const usedQuantity = serviceUsage?.usedQuantity ?? 0;
                const includedQuantity = packService.quantity;
                const remainingQuota = Math.max(0, includedQuantity - usedQuantity);
                
                // Calculate per-unit price from pack (for reference/display)
                const totalQty = packItems.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0);
                const priceToUse = subscription.priceAtSubscription || pack.price;
                const perUnitPrice = totalQty > 0 ? parseFloat(priceToUse) / totalQty : 0;
                
                if (remainingQuota > 0) {
                  // WITHIN QUOTA: Service is covered by pack
                  requestData.monthlyPackSubscriptionId = subscription.id;
                  requestData.monthlyPackUnitPrice = perUnitPrice.toFixed(2);
                  requestData.finalPrice = perUnitPrice.toFixed(2);
                  requestData.discountAmount = "0.00"; // Pack pricing doesn't stack with discounts
                  delete requestData.discountCouponId; // Coupons don't apply to pack pricing
                  
                  // Set pack coverage fields for tracking and display
                  requestData.isPackCovered = true;
                  requestData.isPackOverage = false;
                  requestData.packSubscriptionId = subscription.id;
                  requestData.clientPaymentStatus = "included_in_pack";
                  
                  console.log(`Applied service pack pricing: subscription=${subscription.id}, unitPrice=${perUnitPrice.toFixed(2)}, remaining=${remainingQuota}/${includedQuantity}`);
                } else {
                  // OVERAGE: Beyond pack quota - charge at retail price with client discount
                  // Note: Client discounts (tripodDiscountTier) apply, but NOT coupon discounts
                  const retailPrice = service?.basePrice ? parseFloat(service.basePrice) : 0;
                  let clientDiscountPercent = 0;
                  let priceAfterClientDiscount = retailPrice;
                  
                  // Get client profile to check for tripodDiscountTier
                  let clientProfile = null;
                  if (sessionUser.clientProfileId) {
                    clientProfile = await storage.getClientProfileById(sessionUser.clientProfileId);
                  }
                  if (!clientProfile && ["client", "client_member"].includes(sessionUser.role)) {
                    clientProfile = await storage.getClientProfile(sessionUserId);
                  }
                  
                  // Apply client discount (tripodDiscountTier) - NOT coupon discounts
                  if (clientProfile && clientProfile.tripodDiscountTier && clientProfile.tripodDiscountTier !== "none") {
                    clientDiscountPercent = getTripodDiscountPercent(clientProfile.tripodDiscountTier);
                    priceAfterClientDiscount = retailPrice * (1 - clientDiscountPercent / 100);
                  }
                  
                  // Set overage pricing on the request
                  requestData.monthlyPackSubscriptionId = subscription.id;
                  requestData.monthlyPackUnitPrice = perUnitPrice.toFixed(2);
                  requestData.finalPrice = priceAfterClientDiscount.toFixed(2);
                  requestData.discountAmount = (retailPrice - priceAfterClientDiscount).toFixed(2);
                  delete requestData.discountCouponId; // NO coupon discounts on overages
                  
                  // Mark as overage
                  requestData.isPackCovered = false;
                  requestData.isPackOverage = true;
                  requestData.packSubscriptionId = subscription.id;
                  requestData.overageRetailPrice = retailPrice.toFixed(2);
                  requestData.overageClientDiscount = clientDiscountPercent.toFixed(2);
                  requestData.clientPaymentStatus = "pending"; // Overage needs to be billed
                  
                  console.log(`Pack OVERAGE: subscription=${subscription.id}, retail=$${retailPrice}, clientDiscount=${clientDiscountPercent}%, final=$${priceAfterClientDiscount.toFixed(2)}, used=${usedQuantity}/${includedQuantity}`);
                }
                break; // Use the first matching subscription
              }
            }
          }
        } catch (packError) {
          console.error("Error checking service pack subscription:", packError);
          // Continue without pack pricing if there's an error
        }
      }

      // Server-authoritative pricing calculation for ad-hoc service requests (not pack-based)
      // Always calculate pricing server-side to prevent tampering
      if (!requestData.monthlyPackSubscriptionId && req.body.serviceId) {
        // Preserve incoming coupon ID for validation, then clear all client-provided pricing values
        const incomingCouponId = req.body.discountCouponId || null;
        delete requestData.finalPrice;
        delete requestData.discountAmount;
        delete requestData.discountCouponId;
        
        try {
          const service = await storage.getService(req.body.serviceId);
          if (service && service.basePrice) {
            const basePrice = parseFloat(service.basePrice);
            let priceAfterTripod = basePrice;
            let tripodDiscountAmount = 0;
            
            // Step 1: Apply Tri-POD discount if client has a tier
            // First try to get client profile by ID on user, fallback to looking up by user ID
            let clientProfile = null;
            if (sessionUser.clientProfileId) {
              clientProfile = await storage.getClientProfileById(sessionUser.clientProfileId);
            }
            // Fallback: look up client profile by user ID (for primary users)
            if (!clientProfile && ["client", "client_member"].includes(sessionUser.role)) {
              clientProfile = await storage.getClientProfile(sessionUserId);
            }
            
            if (clientProfile && clientProfile.tripodDiscountTier && clientProfile.tripodDiscountTier !== "none") {
              priceAfterTripod = applyTripodDiscount(basePrice, clientProfile.tripodDiscountTier);
              tripodDiscountAmount = basePrice - priceAfterTripod;
            }
            
            // Step 2: Validate and apply coupon discount on top of Tri-POD discounted price
            let couponDiscountAmount = 0;
            let validatedCouponId: string | null = null;
            
            if (incomingCouponId) {
              const coupon = await storage.getDiscountCoupon(incomingCouponId);
              if (coupon && coupon.isActive) {
                // Validate coupon scope
                let couponValid = true;
                
                // Check if coupon applies to services at all (using new appliesToServices field)
                if (coupon.appliesToServices === false) {
                  couponValid = false;
                  console.log(`Coupon ${coupon.code} rejected: does not apply to services`);
                }
                
                // Check service restriction (specific service must match)
                if (coupon.serviceId && coupon.serviceId !== req.body.serviceId) {
                  couponValid = false;
                  console.log(`Coupon ${coupon.code} rejected: service mismatch`);
                }
                
                // Check client restriction (coupon.clientId can be a user ID or client profile ID)
                if (coupon.clientId) {
                  // Match against: session user ID, client profile ID, or check if coupon targets any team member
                  let clientMatch = coupon.clientId === sessionUserId;
                  if (!clientMatch && sessionUser.clientProfileId) {
                    clientMatch = coupon.clientId === sessionUser.clientProfileId;
                    // Also check if coupon clientId matches the user's company
                    if (!clientMatch) {
                      const teamMembers = await storage.getClientTeamMembers(sessionUser.clientProfileId);
                      clientMatch = teamMembers.some(member => member.id === coupon.clientId);
                    }
                  }
                  if (!clientMatch) {
                    couponValid = false;
                    console.log(`Coupon ${coupon.code} rejected: client mismatch`);
                  }
                }
                
                // Check usage limit
                if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
                  couponValid = false;
                  console.log(`Coupon ${coupon.code} rejected: usage limit reached`);
                }
                
                // Check expiry
                if (coupon.validTo && new Date(coupon.validTo) < new Date()) {
                  couponValid = false;
                  console.log(`Coupon ${coupon.code} rejected: expired`);
                }
                
                if (couponValid) {
                  if (coupon.discountType === "percentage") {
                    couponDiscountAmount = priceAfterTripod * (parseFloat(coupon.discountValue) / 100);
                  } else {
                    couponDiscountAmount = parseFloat(coupon.discountValue);
                  }
                  validatedCouponId = coupon.id;
                  console.log(`Applied coupon discount: ${coupon.discountType}=${coupon.discountValue}, amount=${couponDiscountAmount}`);
                }
              }
            }
            
            // Step 3: Calculate final price (server-authoritative, overwrites any client values)
            const totalDiscount = tripodDiscountAmount + couponDiscountAmount;
            const finalPrice = Math.max(0, basePrice - totalDiscount);
            
            requestData.finalPrice = finalPrice.toFixed(2);
            requestData.discountAmount = totalDiscount.toFixed(2);
            
            // Only store validated coupon ID
            if (validatedCouponId) {
              requestData.discountCouponId = validatedCouponId;
            } else {
              delete requestData.discountCouponId;
            }
          }
        } catch (pricingError) {
          console.error("Error calculating service request pricing:", pricingError);
          // On error, ensure we don't store client-provided discount values
          delete requestData.finalPrice;
          delete requestData.discountAmount;
          delete requestData.discountCouponId;
        }
      } else if (!requestData.monthlyPackSubscriptionId) {
        // No serviceId or pricing error - clear any client-provided discount values
        delete requestData.finalPrice;
        delete requestData.discountAmount;
        delete requestData.discountCouponId;
      }

      let request = await storage.createServiceRequest(requestData);

      // If a discount coupon was used, increment the usage counter
      if (request.discountCouponId) {
        try {
          await storage.incrementCouponUsage(request.discountCouponId);
        } catch (couponError) {
          console.error("Failed to increment coupon usage:", couponError);
        }
      }

      // If pack pricing was applied, increment the usage counter
      if (request.monthlyPackSubscriptionId) {
        try {
          const service = await storage.getService(request.serviceId);
          const fatherServiceId = service?.parentServiceId || request.serviceId;
          // Use CST timezone for consistent billing period tracking
          const { month, year } = getCSTMonthYear();
          await storage.incrementServicePackUsage(
            request.monthlyPackSubscriptionId, 
            fatherServiceId,
            month,
            year
          );
          console.log(`Incremented service pack usage for subscription ${request.monthlyPackSubscriptionId} (CST period: ${month}/${year})`);
        } catch (usageError) {
          console.error("Failed to increment service pack usage:", usageError);
        }
      }

      // Process upfront payment for pay-as-you-go clients (NOT pack-covered jobs)
      // Pack-covered jobs don't need upfront payment
      // Use request.userId to get the actual client's payment config (not session user)
      if (!request.isPackCovered && request.finalPrice && parseFloat(request.finalPrice) > 0) {
        try {
          const { paymentProcessor } = await import("./services/paymentProcessor");
          
          // Get the actual job owner's profile (not the session user who might be admin)
          const jobOwner = await storage.getUser(request.userId);
          const jobOwnerClientProfile = jobOwner?.clientProfileId 
            ? await storage.getClientProfileById(jobOwner.clientProfileId)
            : (jobOwner && ["client", "client_member"].includes(jobOwner.role))
              ? await storage.getClientProfile(request.userId)
              : null;
          
          if (jobOwnerClientProfile && jobOwnerClientProfile.paymentConfiguration === "pay_as_you_go") {
            const paymentResult = await paymentProcessor.processUpfrontPayment(request, "service_request");
            
            if (!paymentResult.success) {
              // Payment failed - update job status to payment_failed
              request = await storage.updateServiceRequest(request.id, { 
                status: "payment_failed" 
              }) || request;
              console.log(`Upfront payment failed for service request ${request.id}: ${paymentResult.error}`);
            } else {
              console.log(`Upfront payment processed for service request ${request.id}`);
            }
          }
        } catch (paymentError) {
          console.error("Upfront payment processing error:", paymentError);
          // Mark as payment_failed if we couldn't process payment
          request = await storage.updateServiceRequest(request.id, { 
            status: "payment_failed" 
          }) || request;
        }
      }

      // Trigger auto-assignment if no manual assignment was provided (and job is not payment_failed)
      if (request.status !== "payment_failed" && !hasManualAssignment && !request.assigneeId && !request.vendorAssigneeId) {
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

      // Block assignment for payment_failed jobs - must resolve payment first
      if (existingRequest.status === "payment_failed") {
        return res.status(400).json({ error: "Cannot assign designers to jobs with failed payment. Client must add a valid payment method." });
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

  // Start job - transition from pending to in-progress without reassignment
  app.post("/api/service-requests/:id/start", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      if (existingRequest.status !== "pending") {
        return res.status(400).json({ error: "Can only start pending jobs" });
      }

      if (existingRequest.status === "payment_failed") {
        return res.status(400).json({ error: "Cannot start jobs with failed payment" });
      }

      const isAssignee = existingRequest.assigneeId === sessionUserId;
      const isVendorAssignee = existingRequest.vendorAssigneeId === sessionUserId;
      const isAdmin = sessionUser.role === "admin";
      const isInternalDesigner = sessionUser.role === "internal_designer";

      if (!isAssignee && !isVendorAssignee && !isAdmin && !isInternalDesigner) {
        return res.status(403).json({ error: "Only the assigned designer, admin, or internal designer can start this job" });
      }

      const request = await storage.updateServiceRequest(req.params.id, {
        status: "in-progress",
      });
      res.json(request);
    } catch (error) {
      console.error("Error starting service request:", error);
      res.status(500).json({ error: "Failed to start job" });
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

      // Block assignment for payment_failed jobs
      if (existingRequest.status === "payment_failed") {
        return res.status(400).json({ error: "Cannot assign vendors to jobs with failed payment. Client must add a valid payment method." });
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
      
      // Process payment based on client payment configuration
      if (request) {
        try {
          const { paymentProcessor } = await import("./services/paymentProcessor");
          const paymentResult = await paymentProcessor.processServiceRequestPayment(request, sessionUserId);
          if (!paymentResult.success && paymentResult.error) {
            console.warn("Payment processing warning:", paymentResult.error);
          }
        } catch (paymentError) {
          console.error("Payment processing error (non-blocking):", paymentError);
        }
      }
      
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

      // Check if the currently assigned designer is still active
      // If not, reassign to the appropriate admin before processing the change request
      let reassignmentInfo = null;
      if (existingRequest.assigneeId) {
        const assignee = await storage.getUser(existingRequest.assigneeId);
        if (assignee && !assignee.isActive) {
          // Designer is deactivated, need to reassign
          if (assignee.role === "vendor_designer" && assignee.vendorId) {
            const vendorAdmin = await storage.getPrimaryVendorAdmin(assignee.vendorId);
            if (vendorAdmin) {
              await storage.updateServiceRequest(req.params.id, { 
                assigneeId: vendorAdmin.id, 
                assignedAt: new Date() 
              });
              reassignmentInfo = { reassignedTo: vendorAdmin.username, reason: "Original designer is no longer active" };
              console.log(`Change request: Reassigned service request ${req.params.id} from inactive vendor designer ${assignee.username} to vendor admin ${vendorAdmin.username}`);
            } else {
              // Fallback to platform admin
              const platformAdmin = await storage.getPrimaryPlatformAdmin();
              if (platformAdmin) {
                await storage.updateServiceRequest(req.params.id, { 
                  assigneeId: platformAdmin.id, 
                  assignedAt: new Date() 
                });
                reassignmentInfo = { reassignedTo: platformAdmin.username, reason: "Original designer and vendor admin are no longer active" };
                console.log(`Change request: Reassigned service request ${req.params.id} from inactive vendor designer ${assignee.username} to platform admin ${platformAdmin.username} (vendor admin unavailable)`);
              }
            }
          } else if (assignee.role === "internal_designer") {
            const platformAdmin = await storage.getPrimaryPlatformAdmin();
            if (platformAdmin) {
              await storage.updateServiceRequest(req.params.id, { 
                assigneeId: platformAdmin.id, 
                assignedAt: new Date() 
              });
              reassignmentInfo = { reassignedTo: platformAdmin.username, reason: "Original designer is no longer active" };
              console.log(`Change request: Reassigned service request ${req.params.id} from inactive internal designer ${assignee.username} to platform admin ${platformAdmin.username}`);
            }
          }
        }
      }

      const request = await storage.requestChange(req.params.id, changeNote);
      
      // Also add the change note as a comment with "[Change Request]" prefix
      await storage.createComment({
        requestId: req.params.id,
        authorId: sessionUserId,
        body: `[Change Request] ${changeNote}`,
        visibility: "public",
      });
      
      res.json({ ...request, reassignmentInfo });
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

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      // Block cancellation for in-progress and change-request jobs
      if (existingRequest.status === "in-progress" || existingRequest.status === "change-request") {
        return res.status(400).json({ error: "Jobs in progress or with change requests cannot be canceled" });
      }

      // Only allow cancellation for pending or payment_failed statuses
      if (existingRequest.status !== "pending" && existingRequest.status !== "payment_failed") {
        return res.status(400).json({ error: "Only pending or payment failed requests can be canceled" });
      }

      // Verify permissions: original requester OR admin
      if (existingRequest.userId !== sessionUserId && sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only the requester or admin can cancel this request" });
      }

      // Process automatic refund for pay-as-you-go clients with successful payment
      let automaticRefundCreated = false;
      if (existingRequest.status === "pending" && existingRequest.stripePaymentIntentId) {
        try {
          const user = await storage.getUser(existingRequest.userId);
          if (user?.clientProfileId) {
            const clientProfile = await storage.getClientProfileById(user.clientProfileId);
            
            if (clientProfile && clientProfile.paymentConfiguration === "pay_as_you_go") {
              // Process automatic Stripe refund
              const { stripeService } = await import("./services/stripeService");
              const finalPrice = existingRequest.finalPrice ? parseFloat(existingRequest.finalPrice) : 0;
              const amountCents = Math.round(finalPrice * 100);
              
              if (amountCents > 0) {
                const stripeRefund = await stripeService.refundPayment(
                  existingRequest.stripePaymentIntentId,
                  amountCents,
                  "Job canceled by client - automatic refund"
                );
                
                // Create refund record with "Automatic Refund" indication
                await storage.createRefund({
                  requestType: "service_request",
                  serviceRequestId: existingRequest.id,
                  bundleRequestId: null,
                  clientId: existingRequest.userId,
                  refundType: "full",
                  originalAmount: finalPrice.toFixed(2),
                  refundAmount: finalPrice.toFixed(2),
                  reason: "Automatic refund - job canceled by client",
                  notes: "Automatic refund triggered on cancellation",
                  status: "completed",
                  stripeRefundId: stripeRefund.id,
                  stripePaymentIntentId: existingRequest.stripePaymentIntentId,
                  requestedBy: sessionUserId,
                  processedAt: new Date(),
                  processedBy: sessionUserId,
                  isAutomatic: true,
                });
                
                automaticRefundCreated = true;
                console.log(`Automatic refund processed for service request ${existingRequest.id}`);
              }
            }
          }
        } catch (refundError) {
          console.error("Error processing automatic refund:", refundError);
          // Continue with cancellation even if refund fails - admin can handle manually
        }
      }

      const request = await storage.updateServiceRequest(req.params.id, { 
        status: "canceled"
      });
      
      res.json({ 
        ...request, 
        automaticRefundCreated 
      });
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
        // Admins can always upload deliverables, others must be the assigned user or vendor assignee
        const isAssignee = existingRequest.assigneeId === sessionUserId;
        const isVendorAssignee = existingRequest.vendorAssigneeId === sessionUserId;
        if (sessionUser.role !== "admin" && !isAssignee && !isVendorAssignee) {
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

      // Default user is Ross Adams (Client 1 - Fusion Brands)
      let user = await storage.getUserByUsername("Ross Adams");
      if (!user) {
        // Fallback to default-user for backwards compatibility
        user = await storage.getUserByUsername("default-user");
      }
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
      const validRoles = ["admin", "internal_designer", "internal_designer_2", "vendor", "vendor_2", "vendor_designer", "vendor_designer_2", "client", "client_member", "client_2", "client_member_2", "client_3", "client_member_3", "designer"];
      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({ error: `role must be one of: ${validRoles.join(", ")}` });
      }

      let user;
      
      // Map role switcher values to specific usernames
      const roleToUsername: Record<string, string> = {
        "admin": "Matias Rivero",              // Main Platform Admin
        "internal_designer": "Federico Chami", // Internal Designer 1
        "internal_designer_2": "Marina Siarri", // Internal Designer 2
        "vendor": "Javier Rubianes",           // Vendor 1 (Pixel's Hive)
        "vendor_designer": "Pablo Frabotta",   // Vendor Designer 1 (Pixel's Hive)
        "vendor_2": "Simon Doe",               // Vendor 2 (Artwork Service Co)
        "vendor_designer_2": "Richard Smith",  // Vendor Designer 2 (Artwork Service Co)
        "client": "Ross Adams",                // Client 1 (Pay as you go - Fusion Brands)
        "client_member": "Lourdes LaBelle",    // Client Member 1 (Fusion Brands team)
        "client_2": "Leighton Kountz",         // Client 2 (Monthly Payment - Marketlink)
        "client_member_2": "Joe Ledbetter",    // Client Member 2 (Marketlink team)
        "client_3": "Tatiana Phelan",          // Client 3 (Deduct from Royalties - Shirt Mommy Company)
        "client_member_3": "Santiago Phelan",  // Client Member 3 (Shirt Mommy Company team)
      };
      
      // For client roles, switch to specific test users
      if (roleToUsername[role]) {
        user = await storage.getUserByUsername(roleToUsername[role]);
      }
      
      // For other roles, switch to the dedicated demo user
      if (!user) {
        const username = `${role}-user`;
        user = await storage.getUserByUsername(username);
        
        if (!user) {
          user = await storage.createUser({
            username,
            password: "not-used",
            email: `${username}@example.com`,
            role,
          });
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
      
      // If updating the primary vendor's email, also sync to vendor profile
      if (email !== undefined && targetUser.role === "vendor" && targetUser.id === vendorStructureId) {
        const vendorProfile = await storage.getVendorProfile(vendorStructureId);
        if (vendorProfile) {
          await storage.updateVendorProfile(vendorProfile.id, { email });
        }
      }
      
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
        // Internal Designer can modify anyone (same as admin for user management)
        if (sessionUser.role === "internal_designer") return true;
        // Vendor can modify vendors/vendor_designers under their structure
        if (sessionUser.role === "vendor") {
          const vendorStructureId = sessionUser.vendorId || sessionUserId;
          return targetUser.vendorId === vendorStructureId && 
                 ["vendor", "vendor_designer"].includes(targetUser.role);
        }
        // Primary client can modify themselves and team members in their company
        if (sessionUser.role === "client" && sessionUser.clientProfileId && ["client", "client_member"].includes(targetUser.role)) {
          const clientProfile = await storage.getClientProfileById(sessionUser.clientProfileId);
          if (clientProfile && clientProfile.primaryUserId === sessionUserId) {
            // Primary client can modify themselves and team members (same clientProfileId)
            return targetUser.clientProfileId === sessionUser.clientProfileId;
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
      // Users cannot deactivate themselves (except admins can toggle anyone)
      if (isActive !== undefined && (sessionUser.role === "admin" || targetUser.id !== sessionUserId)) {
        updateData.isActive = isActive;
      }
      
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

      // If deactivating a designer, reassign their undelivered jobs
      let reassignmentInfo = null;
      if (isActive === false && targetUser.isActive === true) {
        // Check if designer has undelivered jobs first
        const undeliveredJobs = await storage.getUndeliveredJobsByDesigner(targetUser.id);
        const hasUndeliveredJobs = undeliveredJobs.serviceRequests.length > 0 || undeliveredJobs.bundleRequests.length > 0;

        if (hasUndeliveredJobs) {
          if (targetUser.role === "vendor_designer" && targetUser.vendorId) {
            // Vendor designer being deactivated - reassign to Primary Vendor Admin
            const vendorAdmin = await storage.getPrimaryVendorAdmin(targetUser.vendorId);
            if (vendorAdmin) {
              // For vendor designers, also update vendorAssigneeId to the vendor admin
              reassignmentInfo = await storage.reassignOrphanedJobsFromDesigner(targetUser.id, vendorAdmin.id, {
                updateVendorAssignee: true,
                newVendorAssigneeId: vendorAdmin.id
              });
              console.log(`Reassigned ${reassignmentInfo.serviceRequests} service requests and ${reassignmentInfo.bundleRequests} bundle requests from vendor designer ${targetUser.username} to vendor admin ${vendorAdmin.username}`);
            } else {
              // No active vendor admin found - fallback to platform admin
              const platformAdmin = await storage.getPrimaryPlatformAdmin();
              if (platformAdmin) {
                reassignmentInfo = await storage.reassignOrphanedJobsFromDesigner(targetUser.id, platformAdmin.id);
                console.log(`No active vendor admin found. Reassigned ${reassignmentInfo.serviceRequests} service requests and ${reassignmentInfo.bundleRequests} bundle requests from vendor designer ${targetUser.username} to platform admin ${platformAdmin.username}`);
              } else {
                // No admin available - cannot deactivate
                return res.status(409).json({ 
                  error: `Cannot deactivate ${targetUser.username}: They have ${undeliveredJobs.serviceRequests.length + undeliveredJobs.bundleRequests.length} undelivered job(s) and no active admin is available for reassignment` 
                });
              }
            }
          } else if (targetUser.role === "internal_designer") {
            // Internal designer being deactivated - reassign to Primary Platform Admin
            const platformAdmin = await storage.getPrimaryPlatformAdmin();
            if (platformAdmin) {
              reassignmentInfo = await storage.reassignOrphanedJobsFromDesigner(targetUser.id, platformAdmin.id);
              console.log(`Reassigned ${reassignmentInfo.serviceRequests} service requests and ${reassignmentInfo.bundleRequests} bundle requests from internal designer ${targetUser.username} to platform admin ${platformAdmin.username}`);
            } else {
              // No admin available - cannot deactivate
              return res.status(409).json({ 
                error: `Cannot deactivate ${targetUser.username}: They have ${undeliveredJobs.serviceRequests.length + undeliveredJobs.bundleRequests.length} undelivered job(s) and no active platform admin is available for reassignment` 
              });
            }
          }
        }
      }

      const updatedUser = await storage.updateUser(req.params.id, updateData);
      res.json({ ...updatedUser, reassignmentInfo });
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
        if (sessionUser.role === "client" && sessionUser.clientProfileId && ["client", "client_member"].includes(targetUser.role)) {
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

      // If deleting/deactivating a designer, reassign their undelivered jobs first
      let reassignmentInfo = null;
      if (targetUser.isActive) {
        // Check if designer has undelivered jobs first
        const undeliveredJobs = await storage.getUndeliveredJobsByDesigner(targetUser.id);
        const hasUndeliveredJobs = undeliveredJobs.serviceRequests.length > 0 || undeliveredJobs.bundleRequests.length > 0;

        if (hasUndeliveredJobs) {
          if (targetUser.role === "vendor_designer" && targetUser.vendorId) {
            // Vendor designer being deleted - reassign to Primary Vendor Admin
            const vendorAdmin = await storage.getPrimaryVendorAdmin(targetUser.vendorId);
            if (vendorAdmin) {
              // For vendor designers, also update vendorAssigneeId to the vendor admin
              reassignmentInfo = await storage.reassignOrphanedJobsFromDesigner(targetUser.id, vendorAdmin.id, {
                updateVendorAssignee: true,
                newVendorAssigneeId: vendorAdmin.id
              });
              console.log(`Reassigned ${reassignmentInfo.serviceRequests} service requests and ${reassignmentInfo.bundleRequests} bundle requests from vendor designer ${targetUser.username} to vendor admin ${vendorAdmin.username}`);
            } else {
              // No active vendor admin found - fallback to platform admin
              const platformAdmin = await storage.getPrimaryPlatformAdmin();
              if (platformAdmin) {
                reassignmentInfo = await storage.reassignOrphanedJobsFromDesigner(targetUser.id, platformAdmin.id);
                console.log(`No active vendor admin found. Reassigned ${reassignmentInfo.serviceRequests} service requests and ${reassignmentInfo.bundleRequests} bundle requests from vendor designer ${targetUser.username} to platform admin ${platformAdmin.username}`);
              } else {
                // No admin available - cannot delete
                return res.status(409).json({ 
                  error: `Cannot delete ${targetUser.username}: They have ${undeliveredJobs.serviceRequests.length + undeliveredJobs.bundleRequests.length} undelivered job(s) and no active admin is available for reassignment` 
                });
              }
            }
          } else if (targetUser.role === "internal_designer") {
            // Internal designer being deleted - reassign to Primary Platform Admin
            const platformAdmin = await storage.getPrimaryPlatformAdmin();
            if (platformAdmin) {
              reassignmentInfo = await storage.reassignOrphanedJobsFromDesigner(targetUser.id, platformAdmin.id);
              console.log(`Reassigned ${reassignmentInfo.serviceRequests} service requests and ${reassignmentInfo.bundleRequests} bundle requests from internal designer ${targetUser.username} to platform admin ${platformAdmin.username}`);
            } else {
              // No admin available - cannot delete
              return res.status(409).json({ 
                error: `Cannot delete ${targetUser.username}: They have ${undeliveredJobs.serviceRequests.length + undeliveredJobs.bundleRequests.length} undelivered job(s) and no active platform admin is available for reassignment` 
              });
            }
          }
        }
      }

      // Instead of hard delete, deactivate the user to preserve referential integrity
      // This prevents foreign key constraint violations from service_requests, bundle_requests, etc.
      await storage.updateUser(req.params.id, { 
        isActive: false,
        clientProfileId: null  // Remove from company team
      });
      res.json({ success: true, reassignmentInfo });
    } catch (error) {
      console.error("Error removing user:", error);
      res.status(500).json({ error: "Failed to remove user" });
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

  // Get client payment status (for payment overdue banner)
  app.get("/api/client-profiles/:profileId/payment-status", async (req, res) => {
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

      res.json({
        paymentOverdue: profile.paymentOverdue || false,
        paymentRetryCount: profile.paymentRetryCount || 0,
        paymentOverdueAt: profile.paymentOverdueAt,
      });
    } catch (error) {
      console.error("Error fetching client payment status:", error);
      res.status(500).json({ error: "Failed to fetch payment status" });
    }
  });

  // Clear payment overdue status (admin only)
  app.post("/api/client-profiles/:profileId/clear-payment-overdue", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only admin can clear payment overdue status" });
      }

      const profile = await storage.getClientProfileById(req.params.profileId);
      if (!profile) {
        return res.status(404).json({ error: "Client profile not found" });
      }

      // Clear payment overdue status
      const updatedProfile = await storage.updateClientProfile(profile.id, {
        paymentOverdue: false,
        paymentRetryCount: 0,
        paymentOverdueAt: null,
      });

      res.json({
        success: true,
        message: "Payment overdue status cleared",
        profile: updatedProfile,
      });
    } catch (error) {
      console.error("Error clearing payment overdue status:", error);
      res.status(500).json({ error: "Failed to clear payment overdue status" });
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

  // ======= CLIENT COMPANIES MANAGEMENT (Admin interface) =======
  
  // List all client companies with primary user details
  app.get("/api/client-companies", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only admins can access client companies" });
      }

      const profiles = await storage.getAllClientProfiles();
      
      // Enrich with primary user details
      const enrichedProfiles = await Promise.all(
        profiles.map(async (profile) => {
          const primaryUser = profile.primaryUserId 
            ? await storage.getUser(profile.primaryUserId)
            : null;
          
          // Get team count
          const teamMembers = await storage.getClientTeamMembers(profile.id);
          
          return {
            ...profile,
            primaryUser: primaryUser ? {
              id: primaryUser.id,
              username: primaryUser.username,
              email: primaryUser.email,
              isActive: primaryUser.isActive,
              lastLoginAt: primaryUser.lastLoginAt,
            } : null,
            teamCount: teamMembers.length,
          };
        })
      );

      res.json(enrichedProfiles);
    } catch (error) {
      console.error("Error fetching client companies:", error);
      res.status(500).json({ error: "Failed to fetch client companies" });
    }
  });

  // Get single client company details (with primary user info)
  app.get("/api/client-companies/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only admins can access client companies" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client company not found" });
      }

      // Enrich with primary user details
      const primaryUser = profile.primaryUserId 
        ? await storage.getUser(profile.primaryUserId)
        : null;

      res.json({
        ...profile,
        primaryUser: primaryUser ? {
          id: primaryUser.id,
          username: primaryUser.username,
          email: primaryUser.email,
          isActive: primaryUser.isActive,
          lastLoginAt: primaryUser.lastLoginAt,
        } : null,
      });
    } catch (error) {
      console.error("Error fetching client company:", error);
      res.status(500).json({ error: "Failed to fetch client company" });
    }
  });

  // Update client company profile
  app.patch("/api/client-companies/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only admins can update client companies" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client company not found" });
      }

      const { companyName, website, phone } = req.body;
      const updated = await storage.updateClientProfile(req.params.id, {
        companyName,
        website,
        phone,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating client company:", error);
      res.status(500).json({ error: "Failed to update client company" });
    }
  });

  // Toggle client company active status (affects all users in the company)
  app.patch("/api/client-companies/:id/toggle-active", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only admins can toggle client status" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client company not found" });
      }

      const { isActive } = req.body;

      // Update all users in this company
      const teamMembers = await storage.getClientTeamMembers(req.params.id);
      for (const member of teamMembers) {
        await storage.updateUser(member.id, { isActive });
      }

      res.json({ success: true, message: `Client company ${isActive ? "activated" : "deactivated"}` });
    } catch (error) {
      console.error("Error toggling client company status:", error);
      res.status(500).json({ error: "Failed to toggle client company status" });
    }
  });

  // Delete client company and all associated users
  app.delete("/api/client-companies/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only admins can delete client companies" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client company not found" });
      }

      // Deactivate and unlink all users from this company first
      const teamMembers = await storage.getClientTeamMembers(req.params.id);
      for (const member of teamMembers) {
        await storage.updateUser(member.id, { 
          isActive: false,
          clientProfileId: null 
        });
      }

      // Delete the profile
      await storage.deleteClientProfile(req.params.id);

      res.json({ success: true, message: "Client company deleted" });
    } catch (error) {
      console.error("Error deleting client company:", error);
      res.status(500).json({ error: "Failed to delete client company" });
    }
  });

  // Get team members for a client company
  app.get("/api/client-companies/:id/team", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only admins can access client team members" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client company not found" });
      }

      const teamMembers = await storage.getClientTeamMembers(req.params.id);
      res.json(teamMembers);
    } catch (error) {
      console.error("Error fetching client team members:", error);
      res.status(500).json({ error: "Failed to fetch team members" });
    }
  });

  // ======= CLIENTS (Client Profiles) =======
  // Endpoints for client company management using existing clientProfiles table
  
  // List all client profiles (admin only)
  app.get("/api/org-companies", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const profiles = await storage.getAllClientProfiles();
      
      // Enrich with member count and primary contact info
      const enrichedProfiles = await Promise.all(
        profiles.map(async (profile) => {
          const members = await storage.getClientTeamMembers(profile.id);
          const primaryContact = profile.primaryUserId 
            ? await storage.getUser(profile.primaryUserId) 
            : null;
          
          return {
            id: profile.id,
            name: profile.companyName,
            industry: profile.industry,
            website: profile.website,
            email: profile.email,
            phone: profile.phone,
            address: profile.address,
            paymentConfiguration: profile.paymentConfiguration,
            tripodDiscountTier: profile.tripodDiscountTier,
            stripeCustomerId: profile.stripeCustomerId,
            isActive: profile.deletedAt ? 0 : 1,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
            memberCount: members.length,
            primaryContact: primaryContact ? {
              id: primaryContact.id,
              username: primaryContact.username,
              email: primaryContact.email,
            } : null,
            defaultVendor: null,
          };
        })
      );

      res.json(enrichedProfiles);
    } catch (error) {
      console.error("Error fetching client profiles:", error);
      res.status(500).json({ error: "Failed to fetch clients" });
    }
  });

  // Get single client profile
  app.get("/api/org-companies/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client not found" });
      }

      const members = await storage.getClientTeamMembers(profile.id);
      const primaryContact = profile.primaryUserId 
        ? await storage.getUser(profile.primaryUserId) 
        : null;

      res.json({
        id: profile.id,
        name: profile.companyName,
        industry: profile.industry,
        website: profile.website,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        paymentConfiguration: profile.paymentConfiguration,
        tripodDiscountTier: profile.tripodDiscountTier,
        stripeCustomerId: profile.stripeCustomerId,
        isActive: profile.deletedAt ? 0 : 1,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        memberCount: members.length,
        members,
        primaryContact: primaryContact ? {
          id: primaryContact.id,
          username: primaryContact.username,
          email: primaryContact.email,
        } : null,
        defaultVendor: null,
      });
    } catch (error) {
      console.error("Error fetching client profile:", error);
      res.status(500).json({ error: "Failed to fetch client" });
    }
  });

  // Create client profile
  app.post("/api/org-companies", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { name, industry, website, email, phone, address, primaryContactId, paymentConfiguration } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Company name is required" });
      }

      // Create a placeholder user as primary user if no primaryContactId is provided
      const primaryUserId = primaryContactId || sessionUserId;

      const profile = await storage.createClientProfile({
        companyName: name,
        primaryUserId,
        industry,
        website,
        email,
        phone,
        address,
        paymentConfiguration: paymentConfiguration || "pay_as_you_go",
      });

      res.status(201).json({
        id: profile.id,
        name: profile.companyName,
        industry: profile.industry,
        website: profile.website,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        paymentConfiguration: profile.paymentConfiguration,
        isActive: profile.deletedAt ? 0 : 1,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      });
    } catch (error) {
      console.error("Error creating client profile:", error);
      res.status(500).json({ error: "Failed to create client" });
    }
  });

  // Update client profile
  app.patch("/api/org-companies/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client not found" });
      }

      // Map incoming fields to clientProfile fields
      const updateData: any = {};
      if (req.body.name !== undefined) updateData.companyName = req.body.name;
      if (req.body.industry !== undefined) updateData.industry = req.body.industry;
      if (req.body.website !== undefined) updateData.website = req.body.website;
      if (req.body.email !== undefined) updateData.email = req.body.email;
      if (req.body.phone !== undefined) updateData.phone = req.body.phone;
      if (req.body.address !== undefined) updateData.address = req.body.address;
      if (req.body.paymentConfiguration !== undefined) updateData.paymentConfiguration = req.body.paymentConfiguration;
      if (req.body.primaryContactId !== undefined) updateData.primaryUserId = req.body.primaryContactId;
      if (req.body.tripodDiscountTier !== undefined) updateData.tripodDiscountTier = req.body.tripodDiscountTier;

      const updated = await storage.updateClientProfile(req.params.id, updateData);
      if (!updated) {
        return res.status(404).json({ error: "Client not found" });
      }

      res.json({
        id: updated.id,
        name: updated.companyName,
        industry: updated.industry,
        website: updated.website,
        email: updated.email,
        phone: updated.phone,
        address: updated.address,
        paymentConfiguration: updated.paymentConfiguration,
        tripodDiscountTier: updated.tripodDiscountTier,
        isActive: updated.deletedAt ? 0 : 1,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      });
    } catch (error) {
      console.error("Error updating client profile:", error);
      res.status(500).json({ error: "Failed to update client" });
    }
  });

  // Delete (soft) client profile
  app.delete("/api/org-companies/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client not found" });
      }

      await storage.deleteClientProfile(req.params.id);
      res.json({ success: true, message: "Client deleted" });
    } catch (error) {
      console.error("Error deleting client profile:", error);
      res.status(500).json({ error: "Failed to delete client" });
    }
  });

  // Get members of a client profile
  app.get("/api/org-companies/:id/members", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client not found" });
      }

      const members = await storage.getClientTeamMembers(req.params.id);
      res.json(members);
    } catch (error) {
      console.error("Error fetching client members:", error);
      res.status(500).json({ error: "Failed to fetch members" });
    }
  });

  // Add a user to a client profile
  app.post("/api/org-companies/:id/members", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client not found" });
      }

      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Link user to client profile
      await storage.updateUser(userId, { clientProfileId: req.params.id });
      res.json({ success: true, message: "User added to client" });
    } catch (error) {
      console.error("Error adding member to client:", error);
      res.status(500).json({ error: "Failed to add member" });
    }
  });

  // Remove a user from a client profile
  app.delete("/api/org-companies/:id/members/:userId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const profile = await storage.getClientProfileById(req.params.id);
      if (!profile) {
        return res.status(404).json({ error: "Client not found" });
      }

      const user = await storage.getUser(req.params.userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (user.clientProfileId !== req.params.id) {
        return res.status(400).json({ error: "User is not a member of this client" });
      }

      // Cannot remove the primary contact
      if (profile.primaryUserId === req.params.userId) {
        return res.status(400).json({ error: "Cannot remove the primary contact. Assign a new primary contact first." });
      }

      // Unlink user from client profile
      await storage.updateUser(req.params.userId, { clientProfileId: null });
      res.json({ success: true, message: "User removed from company" });
    } catch (error) {
      console.error("Error removing member from company:", error);
      res.status(500).json({ error: "Failed to remove member" });
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

  // Validate if a service+quantity combination already exists
  app.post("/api/service-packs/validate-duplicate", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const { serviceId, quantity, excludePackId } = req.body;
      if (!serviceId || !quantity) {
        return res.status(400).json({ error: "serviceId and quantity are required" });
      }
      
      const existingPacks = await storage.getAllServicePacks();
      
      // Check new-style packs (serviceId directly on pack)
      const duplicateNewStyle = existingPacks.find(
        (p: any) => p.id !== excludePackId && p.serviceId === serviceId && p.quantity === quantity
      );
      if (duplicateNewStyle) {
        return res.json({ 
          isDuplicate: true,
          existingPackName: duplicateNewStyle.name
        });
      }
      
      // Check legacy packs (serviceId in items table)
      for (const existingPack of existingPacks) {
        if (existingPack.id === excludePackId) continue;
        if (existingPack.serviceId) continue;
        
        const items = await storage.getServicePackItems(existingPack.id);
        const matchingItem = items.find(
          (item: any) => item.serviceId === serviceId && item.quantity === quantity
        );
        if (matchingItem) {
          return res.json({ 
            isDuplicate: true,
            existingPackName: existingPack.name
          });
        }
      }
      
      return res.json({ isDuplicate: false });
    } catch (error) {
      console.error("Error validating duplicate pack:", error);
      res.status(500).json({ error: "Failed to validate" });
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
      
      // Validate required fields for new pack structure
      const { serviceId, quantity } = req.body;
      if (!serviceId) {
        return res.status(400).json({ error: "Service ID is required for packs" });
      }
      if (!quantity || quantity < 1) {
        return res.status(400).json({ error: "Valid quantity is required for packs" });
      }
      
      // Check for duplicate service+quantity combination (both new-style and legacy packs)
      const existingPacks = await storage.getAllServicePacks();
      
      // Check new-style packs (serviceId directly on pack)
      const duplicateNewStyle = existingPacks.find(
        (p: any) => p.serviceId === serviceId && p.quantity === quantity
      );
      if (duplicateNewStyle) {
        return res.status(400).json({ 
          error: `A pack with this same service and quantity (${quantity}) already exists ("${duplicateNewStyle.name}"). Please choose a different quantity or service.` 
        });
      }
      
      // Check legacy packs (serviceId in items table)
      for (const existingPack of existingPacks) {
        // Skip new-style packs (already checked above)
        if (existingPack.serviceId) continue;
        
        const items = await storage.getServicePackItems(existingPack.id);
        // Check if any legacy pack has the same service+quantity
        const matchingItem = items.find(
          (item: any) => item.serviceId === serviceId && item.quantity === quantity
        );
        if (matchingItem) {
          return res.status(400).json({ 
            error: `A pack with this same service and quantity (${quantity}) already exists ("${existingPack.name}"). Please choose a different quantity or service.` 
          });
        }
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
      
      // If updating serviceId or quantity, check for duplicate combinations
      const { serviceId, quantity } = req.body;
      if (serviceId !== undefined || quantity !== undefined) {
        const currentPack = await storage.getServicePack(req.params.id);
        if (!currentPack) {
          return res.status(404).json({ error: "Service pack not found" });
        }
        
        const finalServiceId = serviceId ?? currentPack.serviceId;
        const finalQuantity = quantity ?? currentPack.quantity;
        
        // Check for duplicate service+quantity combination (excluding current pack)
        const existingPacks = await storage.getAllServicePacks();
        const duplicate = existingPacks.find(
          (p: any) => p.id !== req.params.id && 
               p.serviceId === finalServiceId && 
               p.quantity === finalQuantity
        );
        if (duplicate) {
          return res.status(400).json({ 
            error: `A pack with this same service and quantity (${finalQuantity}) already exists. Please choose a different quantity or service.` 
          });
        }
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
      
      // Check if any subscriptions reference this pack (active or inactive)
      const allSubscriptions = await storage.getAllClientPackSubscriptions();
      const referencingSubscriptions = allSubscriptions.filter(
        (sub: any) => sub.packId === req.params.id || sub.pendingPackId === req.params.id
      );
      const activeCount = referencingSubscriptions.filter((sub: any) => sub.isActive).length;
      const inactiveCount = referencingSubscriptions.length - activeCount;
      
      if (referencingSubscriptions.length > 0) {
        let message = `Cannot delete this pack. It has `;
        if (activeCount > 0 && inactiveCount > 0) {
          message += `${activeCount} active and ${inactiveCount} inactive subscription(s)`;
        } else if (activeCount > 0) {
          message += `${activeCount} active subscription(s)`;
        } else {
          message += `${inactiveCount} inactive subscription(s)`;
        }
        message += `. Please delete those subscriptions first.`;
        return res.status(400).json({ error: message });
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
      
      // Check if this service already exists in the pack
      const existingItems = await storage.getServicePackItems(req.params.id);
      const serviceAlreadyExists = existingItems.some(item => item.serviceId === req.body.serviceId);
      if (serviceAlreadyExists) {
        return res.status(400).json({ error: "This service is already in the pack. Please edit the existing item's quantity instead." });
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

  // ==================== SERVICE PACK SUBSCRIPTION ROUTES ====================

  // Admin: Get all pack subscriptions with enriched data
  app.get("/api/admin/pack-subscriptions", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }

      const subscriptions = await storage.getAllClientPackSubscriptions();
      
      // Enrich with client profile, pack, and vendor data
      const enrichedSubscriptions = await Promise.all(subscriptions.map(async (sub) => {
        const [clientProfile, pack, vendorAssignee, pendingPack, pendingVendorAssignee] = await Promise.all([
          sub.clientProfileId ? storage.getClientProfileById(sub.clientProfileId) : null,
          storage.getServicePack(sub.packId),
          sub.vendorAssigneeId ? storage.getUser(sub.vendorAssigneeId) : null,
          sub.pendingPackId ? storage.getServicePack(sub.pendingPackId) : null,
          sub.pendingVendorAssigneeId ? storage.getUser(sub.pendingVendorAssigneeId) : null,
        ]);
        
        // Get client user info if available
        let clientUser = null;
        if (clientProfile) {
          const teamMembers = await storage.getClientTeamMembers(clientProfile.id);
          clientUser = teamMembers.find((u: any) => u.role === 'client') || teamMembers[0];
        }
        
        // Get pack items for usage calculation
        const packItems = pack ? await storage.getServicePackItems(pack.id) : [];
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        
        // Calculate usage
        let totalIncluded = 0;
        let totalUsed = 0;
        
        // For new-style packs with serviceId directly on pack
        if (pack?.serviceId && pack?.quantity) {
          totalIncluded = pack.quantity;
          const usage = await storage.getServicePackUsage(sub.id, pack.serviceId, currentMonth, currentYear);
          if (usage) {
            totalUsed = usage.usedQuantity;
          }
        } else {
          // Legacy packs with items table
          for (const item of packItems) {
            totalIncluded += item.quantity;
            const usage = await storage.getServicePackUsage(sub.id, item.serviceId, currentMonth, currentYear);
            if (usage) {
              totalUsed += usage.usedQuantity;
            }
          }
        }
        
        return {
          ...sub,
          clientProfile,
          clientUser: clientUser ? { 
            id: clientUser.id, 
            username: clientUser.username, 
            email: clientUser.email 
          } : null,
          pack,
          packItems,
          vendorAssignee: vendorAssignee ? {
            id: vendorAssignee.id,
            username: vendorAssignee.username,
            email: vendorAssignee.email,
          } : null,
          pendingVendorAssignee: pendingVendorAssignee ? {
            id: pendingVendorAssignee.id,
            username: pendingVendorAssignee.username,
            email: pendingVendorAssignee.email,
          } : null,
          pendingPack,
          currentMonth,
          currentYear,
          totalIncluded,
          totalUsed,
        };
      }));

      res.json(enrichedSubscriptions);
    } catch (error) {
      console.error("Error fetching all pack subscriptions:", error);
      res.status(500).json({ error: "Failed to fetch pack subscriptions" });
    }
  });

  // Admin: Get all subscriptions for a specific pack
  app.get("/api/admin/pack-subscriptions/by-pack/:packId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }

      const { packId } = req.params;
      const allSubscriptions = await storage.getAllClientPackSubscriptions();
      
      // Filter by packId
      const subscriptions = allSubscriptions.filter(sub => sub.packId === packId);
      
      // Enrich with client profile data
      const enrichedSubscriptions = await Promise.all(subscriptions.map(async (sub) => {
        const [clientProfile, pack, vendorAssignee] = await Promise.all([
          sub.clientProfileId ? storage.getClientProfileById(sub.clientProfileId) : null,
          storage.getServicePack(sub.packId),
          sub.vendorAssigneeId ? storage.getUser(sub.vendorAssigneeId) : null,
        ]);
        
        // Get client user info if available
        let clientUser = null;
        if (clientProfile) {
          const teamMembers = await storage.getClientTeamMembers(clientProfile.id);
          clientUser = teamMembers.find((u: any) => u.role === 'client') || teamMembers[0];
        }
        
        return {
          id: sub.id,
          packId: sub.packId,
          isActive: sub.isActive,
          stripeStatus: sub.stripeStatus,
          startDate: sub.startDate,
          clientProfile: clientProfile ? {
            id: clientProfile.id,
            companyName: clientProfile.companyName,
          } : null,
          clientUser: clientUser ? { 
            id: clientUser.id, 
            username: clientUser.username, 
            email: clientUser.email 
          } : null,
          vendorAssignee: vendorAssignee ? {
            id: vendorAssignee.id,
            username: vendorAssignee.username,
          } : null,
        };
      }));

      res.json(enrichedSubscriptions);
    } catch (error) {
      console.error("Error fetching subscriptions by pack:", error);
      res.status(500).json({ error: "Failed to fetch subscriptions by pack" });
    }
  });

  // Admin: Update pack subscription (vendor assignment, etc.)
  app.patch("/api/admin/pack-subscriptions/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { 
        vendorAssigneeId, 
        stripeStatus, 
        gracePeriodEndsAt, 
        pendingPackId, 
        pendingChangeType, 
        pendingChangeEffectiveAt,
        pendingVendorAssigneeId,
        pendingVendorEffectiveAt,
        immediateVendorAssignment
      } = req.body;
      
      const updateData: Record<string, any> = {};
      
      // Handle immediate vendor assignment (clears pending)
      if (immediateVendorAssignment && vendorAssigneeId !== undefined) {
        updateData.vendorAssigneeId = vendorAssigneeId;
        updateData.vendorAssignedAt = vendorAssigneeId ? new Date() : null;
        updateData.pendingVendorAssigneeId = null;
        updateData.pendingVendorEffectiveAt = null;
      } else if (vendorAssigneeId !== undefined) {
        updateData.vendorAssigneeId = vendorAssigneeId;
        updateData.vendorAssignedAt = vendorAssigneeId ? new Date() : null;
      }
      
      // Handle pending vendor reassignment
      if (pendingVendorAssigneeId !== undefined) {
        updateData.pendingVendorAssigneeId = pendingVendorAssigneeId;
      }
      if (pendingVendorEffectiveAt !== undefined) {
        updateData.pendingVendorEffectiveAt = pendingVendorEffectiveAt ? new Date(pendingVendorEffectiveAt) : null;
      }
      
      if (stripeStatus !== undefined) updateData.stripeStatus = stripeStatus;
      if (gracePeriodEndsAt !== undefined) updateData.gracePeriodEndsAt = gracePeriodEndsAt ? new Date(gracePeriodEndsAt) : null;
      if (pendingPackId !== undefined) updateData.pendingPackId = pendingPackId;
      if (pendingChangeType !== undefined) updateData.pendingChangeType = pendingChangeType;
      if (pendingChangeEffectiveAt !== undefined) updateData.pendingChangeEffectiveAt = pendingChangeEffectiveAt ? new Date(pendingChangeEffectiveAt) : null;

      const updated = await storage.updateClientPackSubscription(req.params.id, updateData);
      if (!updated) {
        return res.status(404).json({ error: "Subscription not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating pack subscription:", error);
      res.status(500).json({ error: "Failed to update subscription" });
    }
  });

  // Admin: Bulk vendor assignment for pack subscriptions
  app.post("/api/admin/pack-subscriptions/bulk-assign", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }

      const { subscriptionIds, vendorAssigneeId, assignmentType } = req.body;
      
      if (!subscriptionIds || !Array.isArray(subscriptionIds) || subscriptionIds.length === 0) {
        return res.status(400).json({ error: "subscriptionIds array is required" });
      }
      
      if (!vendorAssigneeId) {
        return res.status(400).json({ error: "vendorAssigneeId is required" });
      }

      // Verify vendor exists and has vendor role
      const vendor = await storage.getUser(vendorAssigneeId);
      if (!vendor || vendor.role !== "vendor") {
        return res.status(400).json({ error: "Invalid vendor" });
      }

      const results: { subscriptionId: string; success: boolean; error?: string }[] = [];

      for (const subscriptionId of subscriptionIds) {
        try {
          const subscription = await storage.getClientPackSubscription(subscriptionId);
          if (!subscription) {
            results.push({ subscriptionId, success: false, error: "Subscription not found" });
            continue;
          }

          const updateData: Record<string, any> = {};
          
          if (assignmentType === "immediate") {
            // Immediate assignment
            updateData.vendorAssigneeId = vendorAssigneeId;
            updateData.vendorAssignedAt = new Date();
            updateData.pendingVendorAssigneeId = null;
            updateData.pendingVendorEffectiveAt = null;
          } else {
            // Scheduled for next billing period
            updateData.pendingVendorAssigneeId = vendorAssigneeId;
            updateData.pendingVendorEffectiveAt = subscription.currentPeriodEnd || subscription.endDate;
          }

          await storage.updateClientPackSubscription(subscriptionId, updateData);
          results.push({ subscriptionId, success: true });
        } catch (err) {
          results.push({ subscriptionId, success: false, error: "Failed to update" });
        }
      }

      res.json({ results, successCount: results.filter(r => r.success).length, failCount: results.filter(r => !r.success).length });
    } catch (error) {
      console.error("Error bulk assigning vendors:", error);
      res.status(500).json({ error: "Failed to bulk assign vendors" });
    }
  });

  // Admin: Cancel pending vendor assignment
  app.patch("/api/admin/pack-subscriptions/:id/cancel-pending-vendor", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "internal_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Admin or Internal Designer access required" });
      }

      const updated = await storage.updateClientPackSubscription(req.params.id, {
        pendingVendorAssigneeId: null,
        pendingVendorEffectiveAt: null,
      });
      
      if (!updated) {
        return res.status(404).json({ error: "Subscription not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error canceling pending vendor:", error);
      res.status(500).json({ error: "Failed to cancel pending vendor assignment" });
    }
  });

  // Get client's pack subscriptions
  app.get("/api/service-pack-subscriptions", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      let clientProfileId: string | null = null;
      
      if (sessionUser.role === "admin" && req.query.clientProfileId) {
        clientProfileId = req.query.clientProfileId as string;
      } else if ((sessionUser.role === "client" || sessionUser.role === "client_member") && sessionUser.clientProfileId) {
        clientProfileId = sessionUser.clientProfileId;
      }

      if (!clientProfileId) {
        return res.status(400).json({ error: "Client profile not found" });
      }

      const subscriptions = await storage.getClientPackSubscriptions(clientProfileId);
      
      // Enrich with pack data and usage
      const enrichedSubscriptions = await Promise.all(subscriptions.map(async (sub) => {
        const pack = await storage.getServicePack(sub.packId);
        const packItems = pack ? await storage.getServicePackItems(pack.id) : [];
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        
        // Calculate total included quantity and current usage
        let totalIncluded = 0;
        let totalUsed = 0;
        for (const item of packItems) {
          totalIncluded += item.quantity;
          const usage = await storage.getServicePackUsage(sub.id, item.serviceId, currentMonth, currentYear);
          if (usage) {
            totalUsed += usage.usedQuantity;
          }
        }
        
        return {
          ...sub,
          pack,
          packItems,
          currentMonth,
          currentYear,
          totalIncluded,
          totalUsed,
        };
      }));

      res.json(enrichedSubscriptions);
    } catch (error) {
      console.error("Error fetching pack subscriptions:", error);
      res.status(500).json({ error: "Failed to fetch pack subscriptions" });
    }
  });

  // Get active subscriptions for a client
  app.get("/api/service-pack-subscriptions/active", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      let clientProfileId: string | null = null;
      
      if (sessionUser.role === "admin" && req.query.clientProfileId) {
        clientProfileId = req.query.clientProfileId as string;
      } else if ((sessionUser.role === "client" || sessionUser.role === "client_member") && sessionUser.clientProfileId) {
        clientProfileId = sessionUser.clientProfileId;
      }

      if (!clientProfileId) {
        return res.status(400).json({ error: "Client profile not found" });
      }

      const subscriptions = await storage.getActiveClientPackSubscriptions(clientProfileId);
      res.json(subscriptions);
    } catch (error) {
      console.error("Error fetching active pack subscriptions:", error);
      res.status(500).json({ error: "Failed to fetch active pack subscriptions" });
    }
  });

  // Subscribe to a pack with Stripe integration
  app.post("/api/service-pack-subscriptions", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const { clientProfileId, packId, skipStripe } = req.body;

      // Verify permissions
      const isAdmin = sessionUser.role === "admin";
      const isClient = (sessionUser.role === "client" || sessionUser.role === "client_member") && sessionUser.clientProfileId === clientProfileId;

      if (!isAdmin && !isClient) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Get the pack to record price at subscription
      const pack = await storage.getServicePack(packId);
      if (!pack) {
        return res.status(404).json({ error: "Pack not found" });
      }
      if (!pack.isActive) {
        return res.status(400).json({ error: "Pack is not active" });
      }

      // Check if already subscribed to this pack
      const existingSubs = await storage.getActiveClientPackSubscriptions(clientProfileId);
      const alreadySubscribed = existingSubs.some(s => s.packId === packId);
      if (alreadySubscribed) {
        return res.status(400).json({ error: "Already subscribed to this pack" });
      }

      // Create Stripe subscription with immediate charge (unless skipStripe is true - for admin manual creation)
      let stripeSubscription = null;
      let stripeSubscriptionId = null;
      let stripeStatus = "active";
      let currentPeriodStart = new Date();
      let currentPeriodEnd = new Date();
      currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
      let billingAnchorDay = Math.min(new Date().getDate(), 28);

      if (!skipStripe) {
        try {
          stripeSubscription = await stripeService.createPackSubscription(clientProfileId, pack);
          stripeSubscriptionId = stripeSubscription.id;
          stripeStatus = stripeSubscription.status;
          
          // Safely extract period dates from Stripe subscription
          const periodStart = (stripeSubscription as any).current_period_start;
          const periodEnd = (stripeSubscription as any).current_period_end;
          
          if (periodStart && typeof periodStart === 'number') {
            currentPeriodStart = new Date(periodStart * 1000);
          }
          if (periodEnd && typeof periodEnd === 'number') {
            currentPeriodEnd = new Date(periodEnd * 1000);
          }
          
          // Log for debugging
          console.log("Stripe subscription created:", {
            id: stripeSubscription.id,
            status: stripeSubscription.status,
            periodStart,
            periodEnd,
            currentPeriodStart: currentPeriodStart.toISOString(),
            currentPeriodEnd: currentPeriodEnd.toISOString()
          });
        } catch (stripeError: any) {
          console.error("Stripe subscription creation failed:", stripeError.message);
          return res.status(400).json({ 
            error: stripeError.message || "Failed to process payment. Please check your payment method and try again."
          });
        }
      }

      const subscription = await storage.createClientPackSubscription({
        clientProfileId,
        packId,
        startDate: currentPeriodStart,
        priceAtSubscription: pack.price,
        isActive: true,
        stripeSubscriptionId,
        stripeStatus,
        currentPeriodStart,
        currentPeriodEnd,
        billingAnchorDay,
      });

      res.status(201).json(subscription);
    } catch (error) {
      console.error("Error creating pack subscription:", error);
      res.status(500).json({ error: "Failed to create pack subscription" });
    }
  });

  // Cancel a subscription (at period end by default, or immediately with ?immediate=true)
  app.patch("/api/service-pack-subscriptions/:id/cancel", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const subscription = await storage.getClientPackSubscription(req.params.id);
      if (!subscription) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      // Verify permissions
      const isAdmin = sessionUser.role === "admin";
      const isClient = (sessionUser.role === "client" || sessionUser.role === "client_member") && sessionUser.clientProfileId === subscription.clientProfileId;

      if (!isAdmin && !isClient) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const immediate = req.query.immediate === "true";

      // Cancel Stripe subscription if exists
      let stripeCancelAt: Date | null = null;
      if (subscription.stripeSubscriptionId) {
        try {
          if (immediate) {
            await stripeService.cancelSubscriptionImmediately(subscription.stripeSubscriptionId);
          } else {
            const stripeSub = await stripeService.cancelSubscription(subscription.stripeSubscriptionId);
            // Capture the cancel_at timestamp from Stripe
            if (stripeSub?.cancel_at) {
              stripeCancelAt = new Date(stripeSub.cancel_at * 1000);
            } else if (stripeSub?.current_period_end) {
              // Use current_period_end if cancel_at is not set
              stripeCancelAt = new Date(stripeSub.current_period_end * 1000);
            }
          }
        } catch (stripeError: any) {
          console.error("Error canceling Stripe subscription:", stripeError.message);
          // Continue to update local record even if Stripe fails
        }
      }

      // Determine cancelAt date: Stripe timestamp > local period end > one month from now
      const cancelAtDate = stripeCancelAt || 
        subscription.currentPeriodEnd || 
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const updateData: any = immediate 
        ? { isActive: false, endDate: new Date(), stripeStatus: "canceled" }
        : { stripeStatus: "cancel_at_period_end", cancelAt: cancelAtDate };

      const updated = await storage.updateClientPackSubscription(req.params.id, updateData);

      res.json(updated);
    } catch (error) {
      console.error("Error canceling pack subscription:", error);
      res.status(500).json({ error: "Failed to cancel pack subscription" });
    }
  });

  // Resume/undo a subscription cancellation
  app.patch("/api/service-pack-subscriptions/:id/resume", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const subscription = await storage.getClientPackSubscription(req.params.id);
      if (!subscription) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      // Verify permissions
      const isAdmin = sessionUser.role === "admin";
      const isClient = (sessionUser.role === "client" || sessionUser.role === "client_member") && sessionUser.clientProfileId === subscription.clientProfileId;

      if (!isAdmin && !isClient) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Check if subscription is actually scheduled for cancellation
      if (!subscription.cancelAt && subscription.stripeStatus !== "cancel_at_period_end") {
        return res.status(400).json({ error: "Subscription is not scheduled for cancellation" });
      }

      // Resume Stripe subscription if exists
      if (subscription.stripeSubscriptionId) {
        try {
          await stripeService.resumeSubscription(subscription.stripeSubscriptionId);
        } catch (stripeError: any) {
          console.error("Error resuming Stripe subscription:", stripeError.message);
          return res.status(400).json({ error: stripeError.message || "Failed to resume subscription" });
        }
      }

      // Update local record
      const updated = await storage.updateClientPackSubscription(req.params.id, {
        stripeStatus: "active",
        cancelAt: null,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error resuming pack subscription:", error);
      res.status(500).json({ error: "Failed to resume pack subscription" });
    }
  });

  // Schedule a pack change (upgrade/downgrade) for the next billing cycle
  app.patch("/api/service-pack-subscriptions/:id/change-pack", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const subscription = await storage.getClientPackSubscription(req.params.id);
      if (!subscription) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      // Verify permissions
      const isAdmin = sessionUser.role === "admin";
      const isClient = (sessionUser.role === "client" || sessionUser.role === "client_member") && sessionUser.clientProfileId === subscription.clientProfileId;

      if (!isAdmin && !isClient) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const { newPackId } = req.body;
      if (!newPackId) {
        return res.status(400).json({ error: "New pack ID is required" });
      }

      // Get the new pack
      const newPack = await storage.getServicePack(newPackId);
      if (!newPack || !newPack.isActive) {
        return res.status(400).json({ error: "Invalid pack selected" });
      }

      // Get the current pack to compare
      const currentPack = await storage.getServicePack(subscription.packId);
      if (!currentPack) {
        return res.status(400).json({ error: "Current pack not found" });
      }

      // Verify both packs are for the same service
      if (newPack.serviceId !== currentPack.serviceId) {
        return res.status(400).json({ error: "Can only change to packs for the same service" });
      }

      // Verify packs are different
      if (newPack.id === currentPack.id) {
        return res.status(400).json({ error: "Cannot change to the same pack" });
      }

      // Determine if upgrade or downgrade based on quantity and price
      const currentQty = currentPack.quantity || 0;
      const newQty = newPack.quantity || 0;
      const currentPrice = parseFloat(currentPack.price) || 0;
      const newPrice = parseFloat(newPack.price) || 0;
      
      // Consider it an upgrade if quantity OR price increases
      const changeType = (newQty > currentQty || (newQty === currentQty && newPrice > currentPrice)) 
        ? "upgrade" 
        : "downgrade";

      // Calculate effective date (next billing cycle)
      let effectiveAt = subscription.currentPeriodEnd;
      if (!effectiveAt) {
        // If no current period end, use 30 days from now
        effectiveAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      // Ensure new pack has a Stripe price ID (sync if needed)
      let stripePriceId = newPack.stripePriceId;
      if (!stripePriceId && subscription.stripeSubscriptionId) {
        // Sync pack to Stripe to get a price ID
        try {
          const syncResult = await stripeService.syncPackToStripe(newPack);
          stripePriceId = syncResult.priceId;
          // Update the pack with the new Stripe IDs
          await storage.updateServicePack(newPack.id, {
            stripeProductId: syncResult.productId,
            stripePriceId: syncResult.priceId,
          });
        } catch (syncError: any) {
          console.error("Error syncing pack to Stripe:", syncError.message);
          return res.status(400).json({ error: "Failed to sync pack to payment system" });
        }
      }

      // Schedule the Stripe subscription update if exists
      if (subscription.stripeSubscriptionId && stripePriceId) {
        try {
          const effectiveDate = effectiveAt instanceof Date ? effectiveAt : new Date(effectiveAt);
          // Pass local period end as fallback
          const localPeriodEnd = subscription.currentPeriodEnd 
            ? (subscription.currentPeriodEnd instanceof Date ? subscription.currentPeriodEnd : new Date(subscription.currentPeriodEnd))
            : undefined;
          await stripeService.scheduleSubscriptionUpdate(
            subscription.stripeSubscriptionId,
            stripePriceId,
            effectiveDate,
            localPeriodEnd
          );
        } catch (stripeError: any) {
          console.error("Error scheduling Stripe subscription update:", stripeError.message);
          return res.status(400).json({ error: stripeError.message || "Failed to schedule pack change with payment system" });
        }
      }

      // Update local record with pending change
      const updated = await storage.updateClientPackSubscription(req.params.id, {
        pendingPackId: newPackId,
        pendingChangeType: changeType,
        pendingChangeEffectiveAt: effectiveAt,
      });

      res.json({ ...updated, changeType });
    } catch (error) {
      console.error("Error scheduling pack change:", error);
      res.status(500).json({ error: "Failed to schedule pack change" });
    }
  });

  // Cancel a pending pack change
  app.patch("/api/service-pack-subscriptions/:id/cancel-change", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const subscription = await storage.getClientPackSubscription(req.params.id);
      if (!subscription) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      // Verify permissions
      const isAdmin = sessionUser.role === "admin";
      const isClient = (sessionUser.role === "client" || sessionUser.role === "client_member") && sessionUser.clientProfileId === subscription.clientProfileId;

      if (!isAdmin && !isClient) {
        return res.status(403).json({ error: "Not authorized" });
      }

      // Check if there's actually a pending change
      if (!subscription.pendingPackId) {
        return res.status(400).json({ error: "No pending change to cancel" });
      }

      // Cancel the Stripe scheduled update if exists
      if (subscription.stripeSubscriptionId) {
        try {
          await stripeService.cancelScheduledUpdate(subscription.stripeSubscriptionId);
        } catch (stripeError: any) {
          console.error("Error canceling Stripe scheduled update:", stripeError.message);
          // Continue anyway - we'll clear the pending change locally
        }
      }

      // Clear the pending change
      const updated = await storage.updateClientPackSubscription(req.params.id, {
        pendingPackId: null,
        pendingChangeType: null,
        pendingChangeEffectiveAt: null,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error canceling pending pack change:", error);
      res.status(500).json({ error: "Failed to cancel pending pack change" });
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
      // client and client_member see all requests from their company (client profile)
      if (["client", "client_member"].includes(sessionUser.role)) {
        // Clients and client members see all requests from their company
        if (sessionUser.clientProfileId) {
          requests = await storage.getBundleRequestsByClientProfile(sessionUser.clientProfileId);
        } else {
          requests = await storage.getBundleRequestsByUser(sessionUserId);
        }
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

      // Clients and client members can only view requests from their company
      if (["client", "client_member"].includes(sessionUser.role)) {
        if (sessionUser.clientProfileId) {
          const teamMembers = await storage.getClientTeamMembers(sessionUser.clientProfileId);
          const teamMemberIds = teamMembers.map(u => u.id);
          if (!teamMemberIds.includes(request.userId)) {
            return res.status(403).json({ error: "Access denied" });
          }
        } else if (request.userId !== sessionUserId) {
          return res.status(403).json({ error: "Access denied" });
        }
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

      // Check if client has payment overdue - block new bundle requests for clients with overdue payments
      if (["client", "client_member"].includes(sessionUser.role) && sessionUser.clientProfileId) {
        const clientProfile = await storage.getClientProfileById(sessionUser.clientProfileId);
        if (clientProfile?.paymentOverdue) {
          return res.status(403).json({ 
            error: "Payment overdue. Please resolve outstanding payments before submitting new requests.",
            code: "PAYMENT_OVERDUE"
          });
        }
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

      // Validate and apply discount coupon if provided
      let validatedCoupon: any = null;
      if (requestData.discountCouponCode) {
        const coupon = await storage.getDiscountCouponByCode(requestData.discountCouponCode);
        if (!coupon) {
          return res.status(400).json({ error: "Invalid discount coupon code" });
        }
        
        // Validate coupon is active and within dates
        if (!coupon.isActive) {
          return res.status(400).json({ error: "This coupon is no longer active" });
        }
        const now = new Date();
        if (coupon.validFrom && new Date(coupon.validFrom) > now) {
          return res.status(400).json({ error: "This coupon is not yet valid" });
        }
        if (coupon.validTo && new Date(coupon.validTo) < now) {
          return res.status(400).json({ error: "This coupon has expired" });
        }
        if (coupon.maxUses !== null && coupon.maxUses !== undefined && coupon.currentUses >= coupon.maxUses) {
          return res.status(400).json({ error: "This coupon has reached its usage limit" });
        }
        
        // Validate coupon applies to bundles using new appliesToBundles field
        if (coupon.appliesToBundles === false) {
          return res.status(400).json({ error: "This coupon is only valid for services" });
        }
        
        // Check specific bundle restriction if set
        if (coupon.bundleId && coupon.bundleId !== requestData.bundleId) {
          return res.status(400).json({ error: "This coupon is not valid for the selected bundle" });
        }
        
        // Validate client restriction (if any) - check both userId and clientProfileId
        if (coupon.clientId) {
          const clientMatch = coupon.clientId === sessionUserId || 
            (sessionUser.clientProfileId && coupon.clientId === sessionUser.clientProfileId);
          if (!clientMatch) {
            return res.status(400).json({ error: "This coupon is not valid for your account" });
          }
        }

        // Store the coupon ID
        requestData.discountCouponId = coupon.id;
        validatedCoupon = coupon;
      }

      // Server-authoritative pricing calculation
      // Step 1: Get base price from bundle
      const bundle = await storage.getBundle(requestData.bundleId);
      if (!bundle || !bundle.finalPrice) {
        return res.status(400).json({ error: "Bundle not found or has no price" });
      }
      const bundleBasePrice = parseFloat(bundle.finalPrice);

      // Step 2: Apply Tri-POD discount (if client has a tier)
      let priceAfterTripod = bundleBasePrice;
      let tripodDiscountAmount = 0;
      
      // First try to get client profile by ID on user, fallback to looking up by user ID
      let clientProfile = null;
      if (sessionUser.clientProfileId) {
        clientProfile = await storage.getClientProfileById(sessionUser.clientProfileId);
      }
      // Fallback: look up client profile by user ID (for primary users)
      if (!clientProfile && ["client", "client_member"].includes(sessionUser.role)) {
        clientProfile = await storage.getClientProfile(sessionUserId);
      }
      
      if (clientProfile && clientProfile.tripodDiscountTier && clientProfile.tripodDiscountTier !== "none") {
        priceAfterTripod = applyTripodDiscount(bundleBasePrice, clientProfile.tripodDiscountTier);
        tripodDiscountAmount = bundleBasePrice - priceAfterTripod;
      }

      // Step 3: Apply coupon discount (if any) on top of Tri-POD discounted price
      let couponDiscountAmount = 0;
      if (validatedCoupon) {
        if (validatedCoupon.discountType === "percentage") {
          couponDiscountAmount = priceAfterTripod * (parseFloat(validatedCoupon.discountValue) / 100);
        } else {
          couponDiscountAmount = parseFloat(validatedCoupon.discountValue);
        }
      }

      // Step 4: Calculate final price
      const totalDiscountAmount = tripodDiscountAmount + couponDiscountAmount;
      const serverFinalPrice = Math.max(0, bundleBasePrice - totalDiscountAmount);
      
      requestData.discountAmount = totalDiscountAmount.toFixed(2);
      requestData.finalPrice = serverFinalPrice.toFixed(2);

      let request = await storage.createBundleRequest(requestData);
      
      // Increment coupon usage counter AFTER successful creation
      if (validatedCoupon) {
        await storage.incrementCouponUsage(validatedCoupon.id);
      }
      
      // Process upfront payment for pay-as-you-go clients
      // Use request.userId to get the actual client's payment config (not session user)
      if (request.finalPrice && parseFloat(request.finalPrice) > 0) {
        try {
          const { paymentProcessor } = await import("./services/paymentProcessor");
          
          // Get the actual job owner's profile (not the session user who might be admin)
          const jobOwner = await storage.getUser(request.userId);
          const jobOwnerClientProfile = jobOwner?.clientProfileId 
            ? await storage.getClientProfileById(jobOwner.clientProfileId)
            : (jobOwner && ["client", "client_member"].includes(jobOwner.role))
              ? await storage.getClientProfile(request.userId)
              : null;
          
          if (jobOwnerClientProfile && jobOwnerClientProfile.paymentConfiguration === "pay_as_you_go") {
            const paymentResult = await paymentProcessor.processUpfrontPayment(request, "bundle_request");
            
            if (!paymentResult.success) {
              // Payment failed - update job status to payment_failed
              request = await storage.updateBundleRequest(request.id, { 
                status: "payment_failed" 
              }) || request;
              console.log(`Upfront payment failed for bundle request ${request.id}: ${paymentResult.error}`);
            } else {
              console.log(`Upfront payment processed for bundle request ${request.id}`);
            }
          }
        } catch (paymentError) {
          console.error("Upfront payment processing error for bundle:", paymentError);
          // Mark as payment_failed if we couldn't process payment
          request = await storage.updateBundleRequest(request.id, { 
            status: "payment_failed" 
          }) || request;
        }
      }
      
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

      // Check if bundle request exists and is not payment_failed
      const existingRequest = await storage.getBundleRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Bundle request not found" });
      }
      if (existingRequest.status === "payment_failed") {
        return res.status(400).json({ error: "Cannot assign designers to jobs with failed payment. Client must add a valid payment method." });
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

  // Start bundle job - transition from pending to in-progress without reassignment
  app.post("/api/bundle-requests/:id/start", async (req, res) => {
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

      if (existingRequest.status !== "pending") {
        return res.status(400).json({ error: "Can only start pending jobs" });
      }

      if (existingRequest.status === "payment_failed") {
        return res.status(400).json({ error: "Cannot start jobs with failed payment" });
      }

      const isAssignee = existingRequest.assigneeId === sessionUserId;
      const isVendorAssignee = existingRequest.vendorAssigneeId === sessionUserId;
      const isAdmin = sessionUser.role === "admin";
      const isInternalDesigner = sessionUser.role === "internal_designer";

      if (!isAssignee && !isVendorAssignee && !isAdmin && !isInternalDesigner) {
        return res.status(403).json({ error: "Only the assigned designer, admin, or internal designer can start this job" });
      }

      const request = await storage.updateBundleRequest(req.params.id, {
        status: "in-progress",
      });
      res.json(request);
    } catch (error) {
      console.error("Error starting bundle request:", error);
      res.status(500).json({ error: "Failed to start job" });
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

      // Block assignment for payment_failed jobs
      if (existingRequest.status === "payment_failed") {
        return res.status(400).json({ error: "Cannot assign vendors to jobs with failed payment. Client must add a valid payment method." });
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
      
      // Process payment based on client payment configuration
      if (request) {
        try {
          const { paymentProcessor } = await import("./services/paymentProcessor");
          const paymentResult = await paymentProcessor.processBundleRequestPayment(request, sessionUserId);
          if (!paymentResult.success && paymentResult.error) {
            console.warn("Payment processing warning:", paymentResult.error);
          }
        } catch (paymentError) {
          console.error("Payment processing error (non-blocking):", paymentError);
        }
      }
      
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

      // Check if the currently assigned designer is still active
      // If not, reassign to the appropriate admin before processing the change request
      let reassignmentInfo = null;
      if (existingRequest.assigneeId) {
        const assignee = await storage.getUser(existingRequest.assigneeId);
        if (assignee && !assignee.isActive) {
          // Designer is deactivated, need to reassign
          if (assignee.role === "vendor_designer" && assignee.vendorId) {
            const vendorAdmin = await storage.getPrimaryVendorAdmin(assignee.vendorId);
            if (vendorAdmin) {
              // For vendor designers, also update vendorAssigneeId to the vendor admin
              await storage.updateBundleRequest(req.params.id, { 
                assigneeId: vendorAdmin.id, 
                vendorAssigneeId: vendorAdmin.id,
                assignedAt: new Date() 
              });
              reassignmentInfo = { reassignedTo: vendorAdmin.username, reason: "Original designer is no longer active" };
              console.log(`Change request: Reassigned bundle request ${req.params.id} from inactive vendor designer ${assignee.username} to vendor admin ${vendorAdmin.username}`);
            } else {
              // Fallback to platform admin
              const platformAdmin = await storage.getPrimaryPlatformAdmin();
              if (platformAdmin) {
                await storage.updateBundleRequest(req.params.id, { 
                  assigneeId: platformAdmin.id, 
                  assignedAt: new Date() 
                });
                reassignmentInfo = { reassignedTo: platformAdmin.username, reason: "Original designer and vendor admin are no longer active" };
                console.log(`Change request: Reassigned bundle request ${req.params.id} from inactive vendor designer ${assignee.username} to platform admin ${platformAdmin.username} (vendor admin unavailable)`);
              }
            }
          } else if (assignee.role === "internal_designer") {
            const platformAdmin = await storage.getPrimaryPlatformAdmin();
            if (platformAdmin) {
              await storage.updateBundleRequest(req.params.id, { 
                assigneeId: platformAdmin.id, 
                assignedAt: new Date() 
              });
              reassignmentInfo = { reassignedTo: platformAdmin.username, reason: "Original designer is no longer active" };
              console.log(`Change request: Reassigned bundle request ${req.params.id} from inactive internal designer ${assignee.username} to platform admin ${platformAdmin.username}`);
            }
          }
        }
      }

      const request = await storage.requestBundleChange(req.params.id, changeNote);
      res.json({ ...request, reassignmentInfo });
    } catch (error) {
      console.error("Error requesting change on bundle request:", error);
      res.status(500).json({ error: "Failed to request change" });
    }
  });

  // Cancel bundle request (only when pending or payment_failed)
  app.post("/api/bundle-requests/:id/cancel", async (req, res) => {
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

      // Block cancellation for in-progress and change-request jobs
      if (existingRequest.status === "in-progress" || existingRequest.status === "change-request") {
        return res.status(400).json({ error: "Jobs in progress or with change requests cannot be canceled" });
      }

      // Only allow cancellation for pending or payment_failed statuses
      if (existingRequest.status !== "pending" && existingRequest.status !== "payment_failed") {
        return res.status(400).json({ error: "Only pending or payment failed requests can be canceled" });
      }

      // Verify permissions: original requester OR admin
      if (existingRequest.userId !== sessionUserId && sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only the requester or admin can cancel this request" });
      }

      // Process automatic refund for pay-as-you-go clients with successful payment
      let automaticRefundCreated = false;
      if (existingRequest.status === "pending" && existingRequest.stripePaymentIntentId) {
        try {
          const user = await storage.getUser(existingRequest.userId);
          if (user?.clientProfileId) {
            const clientProfile = await storage.getClientProfileById(user.clientProfileId);
            
            if (clientProfile && clientProfile.paymentConfiguration === "pay_as_you_go") {
              // Process automatic Stripe refund
              const { stripeService } = await import("./services/stripeService");
              const finalPrice = existingRequest.finalPrice ? parseFloat(existingRequest.finalPrice) : 0;
              const amountCents = Math.round(finalPrice * 100);
              
              if (amountCents > 0) {
                const stripeRefund = await stripeService.refundPayment(
                  existingRequest.stripePaymentIntentId,
                  amountCents,
                  "Job canceled by client - automatic refund"
                );
                
                // Create refund record with "Automatic Refund" indication
                await storage.createRefund({
                  requestType: "bundle_request",
                  serviceRequestId: null,
                  bundleRequestId: existingRequest.id,
                  clientId: existingRequest.userId,
                  refundType: "full",
                  originalAmount: finalPrice.toFixed(2),
                  refundAmount: finalPrice.toFixed(2),
                  reason: "Automatic refund - job canceled by client",
                  notes: "Automatic refund triggered on cancellation",
                  status: "completed",
                  stripeRefundId: stripeRefund.id,
                  stripePaymentIntentId: existingRequest.stripePaymentIntentId,
                  requestedBy: sessionUserId,
                  processedAt: new Date(),
                  processedBy: sessionUserId,
                  isAutomatic: true,
                });
                
                automaticRefundCreated = true;
                console.log(`Automatic refund processed for bundle request ${existingRequest.id}`);
              }
            }
          }
        } catch (refundError) {
          console.error("Error processing automatic refund for bundle:", refundError);
          // Continue with cancellation even if refund fails - admin can handle manually
        }
      }

      const request = await storage.updateBundleRequest(req.params.id, { 
        status: "canceled"
      });
      
      res.json({ 
        ...request, 
        automaticRefundCreated 
      });
    } catch (error) {
      console.error("Error canceling bundle request:", error);
      res.status(500).json({ error: "Failed to cancel bundle request" });
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

      const request = await storage.getBundleRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Bundle request not found" });
      }

      // Allow admins, internal_designers, vendors, vendor_designers, and the request owner
      const isOwner = request.userId === sessionUserId;
      if (!isOwner && !["admin", "internal_designer", "vendor", "vendor_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
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

      const serviceProfit = totalSales - vendorCost;
      const marginPercent = totalSales > 0 ? (serviceProfit / totalSales) * 100 : 0;

      // Calculate pack profit metrics
      const allPackSubscriptions = await storage.getAllClientPackSubscriptions();
      const allPacks = await storage.getAllServicePacks();
      const allVendorPackCosts = await storage.getAllVendorPackCosts();
      
      const packMap: Record<string, typeof allPacks[0]> = {};
      allPacks.forEach((p: typeof allPacks[0]) => { packMap[p.id] = p; });
      
      // Calculate pack revenue and costs for subscriptions active in the date range
      let packRevenue = 0;
      let packVendorCost = 0;
      
      for (const sub of allPackSubscriptions) {
        // Check if subscription is active
        if (!sub.isActive) continue;
        
        // Check if subscription was active during the date range
        const subStart = sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : new Date(sub.createdAt);
        const subEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
        
        // Skip if subscription started after the end date
        if (subStart > endDate) continue;
        // Skip if subscription ended before the start date
        if (subEnd && subEnd < startDate) continue;
        
        const pack = packMap[sub.packId];
        if (pack) {
          packRevenue += parseFloat(String(pack.price || 0));
          
          // Find vendor cost for this pack using vendorAssigneeId
          if (sub.vendorAssigneeId) {
            const vendorCostEntry = allVendorPackCosts.find(vpc => 
              vpc.packId === sub.packId && vpc.vendorId === sub.vendorAssigneeId
            );
            if (vendorCostEntry) {
              packVendorCost += parseFloat(String(vendorCostEntry.cost || 0));
            }
          }
        }
      }
      
      const packProfit = packRevenue - packVendorCost;
      const packMarginPercent = packRevenue > 0 ? (packProfit / packRevenue) * 100 : 0;
      
      // Total profit combines services and packs
      const totalProfit = serviceProfit + packProfit;
      const totalRevenue = totalSales + packRevenue;
      const totalMarginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

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
          profit: serviceProfit,
          marginPercent,
          aov,
          // Pack metrics
          packRevenue,
          packVendorCost,
          packProfit,
          packMarginPercent,
          // Combined totals
          totalRevenue,
          totalProfit,
          totalMarginPercent,
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

      // Calculate pack job metrics (scoped to filtered requests for vendors)
      const packJobCounts = {
        total: 0,
        delivered: 0,
        inProgress: 0,
        pending: 0,
        changeRequest: 0,
      };

      // Use filtered service requests (already scoped by vendor for vendor roles)
      for (const r of serviceRequests) {
        if (r.packSubscriptionId) {
          packJobCounts.total++;
          if (r.status === "delivered") {
            packJobCounts.delivered++;
          } else if (r.status === "in-progress") {
            packJobCounts.inProgress++;
          } else if (r.status === "pending") {
            packJobCounts.pending++;
          } else if (r.status === "change-request") {
            packJobCounts.changeRequest++;
          }
        }
      }

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
        packJobCounts,
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
        const isDelivered = r.status === "delivered" && r.deliveredAt;
        const jobPeriod = r.vendorPaymentPeriod || (r.deliveredAt ? new Date(r.deliveredAt).toISOString().slice(0, 7) : null);
        const periodMatches = jobPeriod === paymentPeriod;
        
        let excludedByAssignee = false;
        if (r.assigneeId) {
          const assignee = userMap[r.assigneeId];
          if (assignee && ["admin", "internal_designer"].includes(assignee.role)) {
            excludedByAssignee = true;
          }
        }
        
        if (!isDelivered) return false;
        if (!periodMatches) return false;
        if (excludedByAssignee) return false;

        return true;
      });

      // Helper to check if a job belongs to a vendor (either via vendorAssigneeId or assignee's vendorId)
      const jobBelongsToVendor = (vendorUserId: string, vendorAssigneeId: string | null, assigneeId: string | null): boolean => {
        // Direct match via vendorAssigneeId
        if (vendorAssigneeId === vendorUserId) return true;
        // Fallback: check if assignee is a vendor_designer belonging to this vendor
        if (assigneeId) {
          const assignee = userMap[assigneeId];
          if (assignee?.role === "vendor_designer" && assignee?.vendorId === vendorUserId) {
            return true;
          }
        }
        return false;
      };
      
      // If vendor is viewing, filter to only their jobs
      if (sessionUser.role === "vendor") {
        const vendorUserId = sessionUser.id;
        filteredServiceRequests = filteredServiceRequests.filter(r => 
          jobBelongsToVendor(vendorUserId, r.vendorAssigneeId, r.assigneeId)
        );
        filteredBundleRequests = filteredBundleRequests.filter(r => 
          jobBelongsToVendor(vendorUserId, r.vendorAssigneeId, r.assigneeId)
        );
      } else if (vendorId) {
        // Admin can filter by specific vendor
        const vendorIdStr = String(vendorId);
        filteredServiceRequests = filteredServiceRequests.filter(r => 
          jobBelongsToVendor(vendorIdStr, r.vendorAssigneeId, r.assigneeId)
        );
        filteredBundleRequests = filteredBundleRequests.filter(r => 
          jobBelongsToVendor(vendorIdStr, r.vendorAssigneeId, r.assigneeId)
        );
      }

      // Build vendor cost lookup from vendor profiles pricing agreements
      // Priority: 1) Quantity-based pricing (for services like Store Creation), 2) Base pricing agreement, 3) Request's vendorCost field
      const getVendorServiceCost = (
        vendorUserId: string, 
        serviceId: string, 
        serviceName: string, 
        requestVendorCost?: string | null,
        formData?: Record<string, any> | null,
        pricingStructure?: string
      ): number => {
        // First check pricing agreements (keyed by service title, not ID)
        const vendorProfile = vendorProfileMap[vendorUserId];
        if (vendorProfile?.pricingAgreements) {
          const agreements = vendorProfile.pricingAgreements as Record<string, { 
            basePrice?: number | string; 
            cost?: number | string;
            quantity?: Record<string, number | string>;
          }>;
          const agreement = agreements[serviceName];
          
          // Check for quantity-based pricing (e.g., Store Creation)
          if (agreement?.quantity && formData) {
            const productCount = parseInt(formData?.amount_of_products || formData?.amountOfProducts || "0");
            if (productCount > 0) {
              // Find the matching tier based on product count
              // Tier labels are like: "1-50", "51-75", "76-100", ">100"
              let matchedPricePerItem: number | null = null;
              
              for (const [tierLabel, pricePerItem] of Object.entries(agreement.quantity)) {
                const price = typeof pricePerItem === 'string' ? parseFloat(pricePerItem) : pricePerItem;
                if (isNaN(price)) continue;
                
                // Parse tier label to extract min/max range
                if (tierLabel.startsWith(">") || tierLabel.startsWith("≥")) {
                  // Format: ">100" or "≥100" - anything above this number
                  const minVal = parseInt(tierLabel.replace(/[>≥\s]/g, ""));
                  if (!isNaN(minVal) && productCount >= minVal) {
                    matchedPricePerItem = price;
                    break;
                  }
                } else if (tierLabel.includes("-")) {
                  // Format: "1-50", "51-75", etc.
                  const [minStr, maxStr] = tierLabel.split("-");
                  const minVal = parseInt(minStr);
                  const maxVal = parseInt(maxStr);
                  if (!isNaN(minVal) && !isNaN(maxVal) && productCount >= minVal && productCount <= maxVal) {
                    matchedPricePerItem = price;
                    break;
                  }
                }
              }
              
              if (matchedPricePerItem !== null) {
                // Calculate total cost: quantity × price per item
                return Number((productCount * matchedPricePerItem).toFixed(2));
              }
            }
          }
          
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

      // Helper to get the effective vendor ID for a job
      const getEffectiveVendorId = (vendorAssigneeId: string | null, assigneeId: string | null): string | null => {
        if (vendorAssigneeId) return vendorAssigneeId;
        // If no vendorAssigneeId, check if assignee is a vendor_designer and get their vendor
        if (assigneeId) {
          const assignee = userMap[assigneeId];
          if (assignee?.role === "vendor_designer" && assignee?.vendorId) {
            return assignee.vendorId;
          }
        }
        return null;
      };
      
      // Process service requests (ad-hoc)
      for (const r of filteredServiceRequests) {
        const vendorUserId = getEffectiveVendorId(r.vendorAssigneeId, r.assigneeId);
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
        const unitCost = getVendorServiceCost(
          vendorUserId, 
          r.serviceId, 
          serviceName, 
          r.vendorCost,
          r.formData as Record<string, any> | null,
          service?.pricingStructure
        );

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
        const vendorUserId = getEffectiveVendorId(r.vendorAssigneeId, r.assigneeId);
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

      console.log(`[Vendor Payments Jobs] Initial bundles after filter: ${filteredBundleRequests.length}`);
      
      // Filter by vendor
      if (sessionUser.role === "vendor") {
        console.log(`[Vendor Payments Jobs] Vendor filtering for userId: ${sessionUser.id}`);
        filteredBundleRequests.forEach(r => {
          console.log(`[Vendor Payments Jobs] Bundle ${r.id}: vendorAssigneeId=${r.vendorAssigneeId}, match=${r.vendorAssigneeId === sessionUser.id}`);
        });
        filteredServiceRequests = filteredServiceRequests.filter(r => r.vendorAssigneeId === sessionUser.id);
        filteredBundleRequests = filteredBundleRequests.filter(r => r.vendorAssigneeId === sessionUser.id);
        console.log(`[Vendor Payments Jobs] After vendor filter: ${filteredBundleRequests.length} bundles`);
      } else if (vendorId) {
        filteredServiceRequests = filteredServiceRequests.filter(r => r.vendorAssigneeId === vendorId);
        filteredBundleRequests = filteredBundleRequests.filter(r => r.vendorAssigneeId === vendorId);
      }

      // Helper for quantity-based cost calculation (same logic as main report)
      const calculateServiceCost = (
        vendorUserId: string, 
        serviceName: string, 
        requestVendorCost?: string | null,
        formData?: Record<string, any> | null
      ): number => {
        const vendorProfile = vendorProfileMap[vendorUserId];
        if (vendorProfile?.pricingAgreements) {
          const agreements = vendorProfile.pricingAgreements as Record<string, { 
            basePrice?: number | string; 
            cost?: number | string;
            quantity?: Record<string, number | string>;
          }>;
          const agreement = agreements[serviceName];
          
          // Check for quantity-based pricing
          if (agreement?.quantity && formData) {
            const productCount = parseInt(formData?.amount_of_products || formData?.amountOfProducts || "0");
            if (productCount > 0) {
              for (const [tierLabel, pricePerItem] of Object.entries(agreement.quantity)) {
                const price = typeof pricePerItem === 'string' ? parseFloat(pricePerItem) : pricePerItem;
                if (isNaN(price)) continue;
                
                if (tierLabel.startsWith(">") || tierLabel.startsWith("≥")) {
                  const minVal = parseInt(tierLabel.replace(/[>≥\s]/g, ""));
                  if (!isNaN(minVal) && productCount >= minVal) {
                    return Number((productCount * price).toFixed(2));
                  }
                } else if (tierLabel.includes("-")) {
                  const [minStr, maxStr] = tierLabel.split("-");
                  const minVal = parseInt(minStr);
                  const maxVal = parseInt(maxStr);
                  if (!isNaN(minVal) && !isNaN(maxVal) && productCount >= minVal && productCount <= maxVal) {
                    return Number((productCount * price).toFixed(2));
                  }
                }
              }
            }
          }
          
          if (agreement?.basePrice !== undefined && agreement.basePrice !== null) {
            const val = typeof agreement.basePrice === 'string' ? parseFloat(agreement.basePrice) : agreement.basePrice;
            if (!isNaN(val)) return val;
          }
          if (agreement?.cost !== undefined && agreement.cost !== null) {
            const val = typeof agreement.cost === 'string' ? parseFloat(agreement.cost) : agreement.cost;
            if (!isNaN(val)) return val;
          }
        }
        if (requestVendorCost) {
          return parseFloat(requestVendorCost);
        }
        return 0;
      };

      const jobs = [
        ...filteredServiceRequests.map(r => {
          const service = serviceMap[r.serviceId];
          const vendorProfile = r.vendorAssigneeId ? vendorProfileMap[r.vendorAssigneeId] : null;
          const calculatedCost = r.vendorAssigneeId 
            ? calculateServiceCost(
                r.vendorAssigneeId, 
                service?.title || "Unknown Service",
                r.vendorCost,
                r.formData as Record<string, any> | null
              )
            : (r.vendorCost ? parseFloat(r.vendorCost) : 0);
          return {
            id: r.id,
            jobId: `A-${r.id.slice(0, 5).toUpperCase()}`,
            type: "Ad-hoc" as const,
            serviceName: service?.title || "Unknown Service",
            vendorName: vendorProfile?.companyName || (r.vendorAssigneeId ? userMap[r.vendorAssigneeId]?.username : null) || "Unknown",
            customerName: r.customerName,
            deliveredAt: r.deliveredAt,
            vendorCost: calculatedCost,
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

  // ==================== VENDOR DESIGNER WORKLOAD REPORT ROUTES ====================

  // Get vendor designer workload report data
  app.get("/api/reports/vendor-designer-workload", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(403).json({ error: "User not found" });
      }

      // Only vendor can access this report
      if (sessionUser.role !== "vendor") {
        return res.status(403).json({ error: "Access denied" });
      }

      const { period, userId } = req.query;
      const paymentPeriod = period as string || new Date().toISOString().slice(0, 7); // Default to current month YYYY-MM

      const allServiceRequests = await storage.getAllServiceRequests();
      const allBundleRequests = await storage.getAllBundleRequests();
      const allUsers = await storage.getAllUsers();
      const allServices = await storage.getAllServices();
      const allBundles = await storage.getAllBundles();

      const userMap: Record<string, typeof allUsers[0]> = {};
      allUsers.forEach(u => { userMap[u.id] = u; });
      const serviceMap: Record<string, typeof allServices[0]> = {};
      allServices.forEach(s => { serviceMap[s.id] = s; });
      const bundleMap: Record<string, typeof allBundles[0]> = {};
      allBundles.forEach(b => { bundleMap[b.id] = b; });

      // Get all users in this vendor's organization
      // The vendor user's ID is used as the organization identifier
      // Include: the session vendor, vendor_designers with vendorId matching session vendor, 
      // and other vendors in the same organization (vendorId matching session vendor)
      const vendorUserId = sessionUser.id;
      const vendorOrgUsers = allUsers.filter(u => 
        (u.id === vendorUserId) || 
        (u.role === "vendor_designer" && u.vendorId === vendorUserId) ||
        (u.role === "vendor" && u.vendorId === vendorUserId)
      );
      const vendorOrgUserIds = new Set(vendorOrgUsers.map(u => u.id));

      // Filter service requests:
      // 1. Must be delivered
      // 2. Assignee must be in vendor's organization
      // 3. Match payment period (use vendorPaymentPeriod if set, else deliveredAt)
      let filteredServiceRequests = allServiceRequests.filter(r => {
        // Must be delivered
        if (!["delivered"].includes(r.status) || !r.deliveredAt) return false;
        
        // Assignee must be in vendor organization
        if (!r.assigneeId || !vendorOrgUserIds.has(r.assigneeId)) return false;
        
        // Determine job period: use vendorPaymentPeriod if set, else deliveredAt
        const jobPeriod = r.vendorPaymentPeriod || new Date(r.deliveredAt).toISOString().slice(0, 7);
        if (jobPeriod !== paymentPeriod) return false;

        return true;
      });

      let filteredBundleRequests = allBundleRequests.filter(r => {
        // Must be delivered
        if (r.status !== "delivered" || !r.deliveredAt) return false;
        
        // Assignee must be in vendor organization
        if (!r.assigneeId || !vendorOrgUserIds.has(r.assigneeId)) return false;
        
        // Match period
        const jobPeriod = r.vendorPaymentPeriod || new Date(r.deliveredAt).toISOString().slice(0, 7);
        if (jobPeriod !== paymentPeriod) return false;

        return true;
      });

      // Optional: Filter by specific user within the organization
      if (userId && typeof userId === "string" && vendorOrgUserIds.has(userId)) {
        filteredServiceRequests = filteredServiceRequests.filter(r => r.assigneeId === userId);
        filteredBundleRequests = filteredBundleRequests.filter(r => r.assigneeId === userId);
      }

      // Build the jobs list
      const jobs = [
        ...filteredServiceRequests.map(r => {
          const service = serviceMap[r.serviceId];
          const assignee = r.assigneeId ? userMap[r.assigneeId] : null;
          return {
            id: r.id,
            jobId: `A-${r.id.slice(0, 5).toUpperCase()}`,
            type: "Ad-hoc" as const,
            serviceName: service?.title || "Unknown Service",
            userName: assignee?.username || "Unknown",
            userId: r.assigneeId,
            userRole: assignee?.role || "unknown",
            deliveredAt: r.deliveredAt,
          };
        }),
        ...filteredBundleRequests.map(r => {
          const bundle = bundleMap[r.bundleId];
          const assignee = r.assigneeId ? userMap[r.assigneeId] : null;
          return {
            id: r.id,
            jobId: `B-${r.id.slice(0, 5).toUpperCase()}`,
            type: "Bundle" as const,
            serviceName: bundle?.name || "Unknown Bundle",
            userName: assignee?.username || "Unknown",
            userId: r.assigneeId,
            userRole: assignee?.role || "unknown",
            deliveredAt: r.deliveredAt,
          };
        }),
      ];

      // Sort by delivered date (newest first)
      jobs.sort((a, b) => {
        const dateA = a.deliveredAt ? new Date(a.deliveredAt).getTime() : 0;
        const dateB = b.deliveredAt ? new Date(b.deliveredAt).getTime() : 0;
        return dateB - dateA;
      });

      // Build team members list for filter dropdown
      const teamMembers = vendorOrgUsers.map(u => ({
        id: u.id,
        username: u.username,
        role: u.role,
      }));

      res.json({ 
        period: paymentPeriod, 
        jobs,
        teamMembers,
      });
    } catch (error) {
      console.error("Error fetching vendor designer workload:", error);
      res.status(500).json({ error: "Failed to fetch vendor designer workload" });
    }
  });

  // ==================== DISCOUNT COUPON ENDPOINTS ====================

  // Get all discount coupons (admin only)
  app.get("/api/discount-coupons", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }
      const coupons = await storage.getAllDiscountCoupons();
      res.json(coupons);
    } catch (error) {
      console.error("Error fetching discount coupons:", error);
      res.status(500).json({ error: "Failed to fetch discount coupons" });
    }
  });

  // Get single discount coupon (admin only)
  app.get("/api/discount-coupons/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }
      const coupon = await storage.getDiscountCoupon(req.params.id);
      if (!coupon) {
        return res.status(404).json({ error: "Discount coupon not found" });
      }
      res.json(coupon);
    } catch (error) {
      console.error("Error fetching discount coupon:", error);
      res.status(500).json({ error: "Failed to fetch discount coupon" });
    }
  });

  // Create discount coupon (admin only)
  app.post("/api/discount-coupons", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const { code, serviceId, bundleId } = req.body;
      if (!code) {
        return res.status(400).json({ error: "Coupon code is required" });
      }

      // Check for unique code
      const existingCoupon = await storage.getDiscountCouponByCode(code);
      if (existingCoupon) {
        return res.status(400).json({ error: "A coupon with this code already exists" });
      }

      // Convert date strings to Date objects for Drizzle
      const couponData = { ...req.body };
      if (couponData.validFrom && typeof couponData.validFrom === 'string') {
        couponData.validFrom = new Date(couponData.validFrom);
      }
      if (couponData.validTo && typeof couponData.validTo === 'string') {
        couponData.validTo = new Date(couponData.validTo);
      }

      const coupon = await storage.createDiscountCoupon(couponData);
      res.status(201).json(coupon);
    } catch (error) {
      console.error("Error creating discount coupon:", error);
      res.status(500).json({ error: "Failed to create discount coupon" });
    }
  });

  // Update discount coupon (admin only)
  app.patch("/api/discount-coupons/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const { code, serviceId, bundleId } = req.body;
      if (code) {
        // Check for unique code (excluding current coupon)
        const existingCoupon = await storage.getDiscountCouponByCode(code);
        if (existingCoupon && existingCoupon.id !== req.params.id) {
          return res.status(400).json({ error: "A coupon with this code already exists" });
        }
      }

      // Convert date strings to Date objects for Drizzle
      const couponData = { ...req.body };
      if (couponData.validFrom && typeof couponData.validFrom === 'string') {
        couponData.validFrom = new Date(couponData.validFrom);
      }
      if (couponData.validTo && typeof couponData.validTo === 'string') {
        couponData.validTo = new Date(couponData.validTo);
      }

      const coupon = await storage.updateDiscountCoupon(req.params.id, couponData);
      if (!coupon) {
        return res.status(404).json({ error: "Discount coupon not found" });
      }
      res.json(coupon);
    } catch (error) {
      console.error("Error updating discount coupon:", error);
      res.status(500).json({ error: "Failed to update discount coupon" });
    }
  });

  // Delete discount coupon (admin only)
  app.delete("/api/discount-coupons/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }
      await storage.deleteDiscountCoupon(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting discount coupon:", error);
      res.status(500).json({ error: "Failed to delete discount coupon" });
    }
  });

  // Validate discount coupon for a specific service/bundle and client
  app.post("/api/discount-coupons/validate", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { code, serviceId, bundleId, clientId, clientProfileId } = req.body;
      if (!code) {
        return res.status(400).json({ error: "Coupon code is required" });
      }

      // Get session user for clientProfileId check
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const coupon = await storage.getDiscountCouponByCode(code);
      if (!coupon) {
        return res.status(404).json({ error: "Invalid coupon code" });
      }

      // Check if coupon is active
      if (!coupon.isActive) {
        return res.status(400).json({ error: "This coupon is inactive" });
      }

      // Check usage limits (only if maxUses is set - null means unlimited)
      if (coupon.maxUses !== null && coupon.maxUses !== undefined && coupon.currentUses >= coupon.maxUses) {
        return res.status(400).json({ error: "This coupon has reached its maximum uses" });
      }

      // Check valid date range
      const now = new Date();
      if (coupon.validFrom && new Date(coupon.validFrom) > now) {
        return res.status(400).json({ error: "This coupon is not yet valid" });
      }
      if (coupon.validTo && new Date(coupon.validTo) < now) {
        return res.status(400).json({ error: "This coupon has expired" });
      }

      // Check service/bundle restriction based on what's being purchased
      // Using new appliesToServices and appliesToBundles flags for explicit scope control
      const isServiceRequest = !!serviceId && !bundleId;
      const isBundleRequest = !!bundleId && !serviceId;
      
      if (isServiceRequest) {
        // Purchasing a service
        if (coupon.appliesToServices === false) {
          return res.status(400).json({ error: "This coupon is only valid for bundles" });
        }
        // Check specific service restriction
        if (coupon.serviceId && coupon.serviceId !== serviceId) {
          return res.status(400).json({ error: "This coupon is not valid for the selected service" });
        }
      } else if (isBundleRequest) {
        // Purchasing a bundle
        if (coupon.appliesToBundles === false) {
          return res.status(400).json({ error: "This coupon is only valid for services" });
        }
        // Check specific bundle restriction
        if (coupon.bundleId && coupon.bundleId !== bundleId) {
          return res.status(400).json({ error: "This coupon is not valid for the selected bundle" });
        }
      }

      // Check client restriction - check both userId and clientProfileId
      if (coupon.clientId) {
        const clientMatch = coupon.clientId === sessionUserId || 
          (sessionUser.clientProfileId && coupon.clientId === sessionUser.clientProfileId) ||
          (clientProfileId && coupon.clientId === clientProfileId);
        if (!clientMatch) {
          return res.status(400).json({ error: "This coupon is not valid for your account" });
        }
      }

      res.json({
        valid: true,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
        },
      });
    } catch (error) {
      console.error("Error validating discount coupon:", error);
      res.status(500).json({ error: "Failed to validate discount coupon" });
    }
  });

  // Check if coupon code is unique (for form validation)
  app.get("/api/discount-coupons/check-code/:code", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const existingCoupon = await storage.getDiscountCouponByCode(req.params.code);
      res.json({ exists: !!existingCoupon, couponId: existingCoupon?.id });
    } catch (error) {
      console.error("Error checking coupon code:", error);
      res.status(500).json({ error: "Failed to check coupon code" });
    }
  });

  // ==================== PHASE 7: STRIPE BILLING ROUTES ====================
  // Note: Stripe webhook handler is defined in index.ts before express.json() middleware
  // to ensure raw body parsing for signature verification. Endpoint: /api/stripe/webhook

  // Get client payment methods
  app.get("/api/billing/payment-methods", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Get the client profile - user must be a client or admin viewing a client
      let clientProfileId: string | null = null;
      
      if (sessionUser.role === "client" && sessionUser.clientProfileId) {
        clientProfileId = sessionUser.clientProfileId;
      } else if (sessionUser.role === "admin" && req.query.clientProfileId) {
        clientProfileId = req.query.clientProfileId as string;
      }

      if (!clientProfileId) {
        return res.status(400).json({ error: "No client profile found" });
      }

      const paymentMethods = await storage.getClientPaymentMethods(clientProfileId);
      res.json(paymentMethods);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ error: "Failed to fetch payment methods" });
    }
  });

  // Create setup intent for adding a new payment method
  app.post("/api/billing/create-setup-intent", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      let clientProfileId: string | null = null;
      
      if (sessionUser.role === "client" && sessionUser.clientProfileId) {
        clientProfileId = sessionUser.clientProfileId;
      } else if (sessionUser.role === "admin" && req.body.clientProfileId) {
        clientProfileId = req.body.clientProfileId;
      }

      if (!clientProfileId) {
        return res.status(400).json({ error: "No client profile found" });
      }

      const { stripeService } = await import("./services/stripeService");
      const result = await stripeService.createSetupIntent(clientProfileId);
      res.json(result);
    } catch (error) {
      console.error("Error creating setup intent:", error);
      res.status(500).json({ error: "Failed to create setup intent" });
    }
  });

  // Save a payment method after setup intent confirmation
  app.post("/api/billing/save-payment-method", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      let clientProfileId: string | null = null;
      
      if (sessionUser.role === "client" && sessionUser.clientProfileId) {
        clientProfileId = sessionUser.clientProfileId;
      } else if (sessionUser.role === "admin" && req.body.clientProfileId) {
        clientProfileId = req.body.clientProfileId;
      }

      if (!clientProfileId) {
        return res.status(400).json({ error: "No client profile found" });
      }

      const { paymentMethodId, billingAddress, setAsDefault } = req.body;
      if (!paymentMethodId) {
        return res.status(400).json({ error: "Payment method ID is required" });
      }

      const { stripeService } = await import("./services/stripeService");
      await stripeService.savePaymentMethod(
        clientProfileId,
        paymentMethodId,
        billingAddress,
        setAsDefault !== false
      );

      // After saving payment method, automatically retry payment for any payment_failed jobs
      // Get the client profile to find the user ID
      const clientProfile = await storage.getClientProfileById(clientProfileId);
      if (clientProfile && clientProfile.paymentConfiguration === "pay_as_you_go") {
        try {
          const { paymentProcessor } = await import("./services/paymentProcessor");
          
          // Find all payment_failed service requests for users linked to this client profile
          const clientUsers = await storage.getClientTeamMembers(clientProfileId);
          let retryResults: { requestId: string; type: string; success: boolean }[] = [];
          
          for (const user of clientUsers) {
            // Get service requests with payment_failed status
            const userRequests = await storage.getServiceRequestsByUser(user.id);
            const failedRequests = userRequests.filter(r => r.status === "payment_failed");
            for (const request of failedRequests) {
              const result = await paymentProcessor.retryPaymentForJob(request.id, "service_request");
              retryResults.push({ requestId: request.id, type: "service_request", success: result.success });
            }
            
            // Get bundle requests with payment_failed status
            const userBundles = await storage.getBundleRequestsByUser(user.id);
            const failedBundles = userBundles.filter(b => b.status === "payment_failed");
            for (const bundle of failedBundles) {
              const result = await paymentProcessor.retryPaymentForJob(bundle.id, "bundle_request");
              retryResults.push({ requestId: bundle.id, type: "bundle_request", success: result.success });
            }
          }
          
          if (retryResults.length > 0) {
            console.log(`Payment retry results after adding payment method:`, retryResults);
          }
        } catch (retryError) {
          console.error("Error retrying payments after saving payment method:", retryError);
          // Don't fail the save - just log the error
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error saving payment method:", error);
      res.status(500).json({ error: "Failed to save payment method" });
    }
  });

  // Set default payment method
  app.post("/api/billing/set-default-payment-method", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      let clientProfileId: string | null = null;
      
      if (sessionUser.role === "client" && sessionUser.clientProfileId) {
        clientProfileId = sessionUser.clientProfileId;
      } else if (sessionUser.role === "admin" && req.body.clientProfileId) {
        clientProfileId = req.body.clientProfileId;
      }

      if (!clientProfileId) {
        return res.status(400).json({ error: "No client profile found" });
      }

      const { paymentMethodId } = req.body;
      if (!paymentMethodId) {
        return res.status(400).json({ error: "Payment method ID is required" });
      }

      await storage.setDefaultPaymentMethod(clientProfileId, paymentMethodId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error setting default payment method:", error);
      res.status(500).json({ error: "Failed to set default payment method" });
    }
  });

  // Delete payment method
  app.delete("/api/billing/payment-methods/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const paymentMethod = await storage.getClientPaymentMethod(req.params.id);
      if (!paymentMethod) {
        return res.status(404).json({ error: "Payment method not found" });
      }

      // Verify ownership
      let hasAccess = false;
      if (sessionUser.role === "admin") {
        hasAccess = true;
      } else if (sessionUser.role === "client" && sessionUser.clientProfileId === paymentMethod.clientProfileId) {
        hasAccess = true;
      }

      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { stripeService } = await import("./services/stripeService");
      await stripeService.removePaymentMethod(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting payment method:", error);
      res.status(500).json({ error: "Failed to delete payment method" });
    }
  });

  // Update client payment configuration (admin only)
  app.patch("/api/billing/client-config/:clientProfileId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const { clientProfileId } = req.params;
      const { paymentConfiguration, invoiceDay, billingAddress, tripodDiscountTier } = req.body;

      const updates: any = {};
      if (paymentConfiguration) {
        const validConfigs = ["pay_as_you_go", "monthly_payment", "deduct_from_royalties"];
        if (!validConfigs.includes(paymentConfiguration)) {
          return res.status(400).json({ error: "Invalid payment configuration" });
        }
        updates.paymentConfiguration = paymentConfiguration;
      }
      if (invoiceDay !== undefined) {
        if (invoiceDay < 1 || invoiceDay > 28) {
          return res.status(400).json({ error: "Invoice day must be between 1 and 28" });
        }
        updates.invoiceDay = invoiceDay;
      }
      if (billingAddress !== undefined) {
        updates.billingAddress = billingAddress;
      }
      if (tripodDiscountTier !== undefined) {
        const validTiers = ["none", "power_level", "oms_subscription", "enterprise"];
        if (!validTiers.includes(tripodDiscountTier)) {
          return res.status(400).json({ error: "Invalid discount tier" });
        }
        updates.tripodDiscountTier = tripodDiscountTier;
      }

      const updated = await storage.updateClientProfile(clientProfileId, updates);
      if (!updated) {
        return res.status(404).json({ error: "Client profile not found" });
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating client payment configuration:", error);
      res.status(500).json({ error: "Failed to update client payment configuration" });
    }
  });

  // Get client billing info (for client profile page)
  app.get("/api/billing/client-info", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      let clientProfileId: string | null = null;
      
      if (sessionUser.role === "client" && sessionUser.clientProfileId) {
        clientProfileId = sessionUser.clientProfileId;
      } else if (sessionUser.role === "admin" && req.query.clientProfileId) {
        clientProfileId = req.query.clientProfileId as string;
      }

      if (!clientProfileId) {
        return res.status(400).json({ error: "No client profile found" });
      }

      const clientProfile = await storage.getClientProfileById(clientProfileId);
      if (!clientProfile) {
        return res.status(404).json({ error: "Client profile not found" });
      }

      const paymentMethods = await storage.getClientPaymentMethods(clientProfileId);

      res.json({
        paymentConfiguration: clientProfile.paymentConfiguration,
        invoiceDay: clientProfile.invoiceDay,
        billingAddress: clientProfile.billingAddress,
        stripeCustomerId: clientProfile.stripeCustomerId,
        tripodDiscountTier: clientProfile.tripodDiscountTier || "none",
        paymentMethods,
      });
    } catch (error) {
      console.error("Error fetching client billing info:", error);
      res.status(500).json({ error: "Failed to fetch client billing info" });
    }
  });

  // ==================== MONTHLY BILLING CRON ROUTES ====================

  // Run monthly billing (admin only) - trigger manual run or cron job
  app.post("/api/billing/run-monthly", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const { monthlyBillingService } = await import("./services/monthlyBillingService");
      const result = await monthlyBillingService.runMonthlyBilling();

      res.json({
        message: "Monthly billing completed",
        ...result
      });
    } catch (error) {
      console.error("Error running monthly billing:", error);
      res.status(500).json({ error: "Failed to run monthly billing" });
    }
  });

  // Run all monthly billing including pack exceeded services (admin only) - for 1st of month cron
  app.post("/api/billing/run-all-monthly", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const { monthlyBillingService } = await import("./services/monthlyBillingService");
      const result = await monthlyBillingService.runAllMonthlyBilling();

      res.json({
        message: "All monthly billing completed",
        ...result
      });
    } catch (error) {
      console.error("Error running all monthly billing:", error);
      res.status(500).json({ error: "Failed to run all monthly billing" });
    }
  });

  // Run pack exceeded billing only (admin only)
  app.post("/api/billing/run-pack-exceeded", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const { monthlyBillingService } = await import("./services/monthlyBillingService");
      const result = await monthlyBillingService.runPackExceededBilling();

      res.json({
        message: "Pack exceeded billing completed",
        ...result
      });
    } catch (error) {
      console.error("Error running pack exceeded billing:", error);
      res.status(500).json({ error: "Failed to run pack exceeded billing" });
    }
  });

  // Retry failed monthly billings (admin only)
  app.post("/api/billing/retry-failed", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const { monthlyBillingService } = await import("./services/monthlyBillingService");
      const result = await monthlyBillingService.retryFailedBillings();

      res.json({
        message: "Retry processing completed",
        ...result
      });
    } catch (error) {
      console.error("Error retrying failed billings:", error);
      res.status(500).json({ error: "Failed to retry billings" });
    }
  });

  // Clear payment overdue status (admin only)
  app.post("/api/billing/clear-overdue/:clientProfileId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const { clientProfileId } = req.params;
      const { monthlyBillingService } = await import("./services/monthlyBillingService");
      const success = await monthlyBillingService.clearPaymentOverdue(clientProfileId);

      if (success) {
        res.json({ message: "Payment overdue status cleared" });
      } else {
        res.status(500).json({ error: "Failed to clear payment overdue status" });
      }
    } catch (error) {
      console.error("Error clearing payment overdue:", error);
      res.status(500).json({ error: "Failed to clear payment overdue status" });
    }
  });

  // Get monthly billing records (admin only)
  app.get("/api/billing/monthly-records", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const { period, clientProfileId } = req.query;

      let records;
      if (period && typeof period === "string") {
        records = await storage.getMonthlyBillingRecordsByPeriod(period);
      } else if (clientProfileId && typeof clientProfileId === "string") {
        records = await storage.getMonthlyBillingRecordsByClientProfile(clientProfileId);
      } else {
        // Get all pending and recent records
        const pending = await storage.getPendingMonthlyBillingRecords();
        const failed = await storage.getFailedMonthlyBillingRecords();
        records = [...pending, ...failed];
      }

      res.json(records);
    } catch (error) {
      console.error("Error fetching monthly billing records:", error);
      res.status(500).json({ error: "Failed to fetch billing records" });
    }
  });

  // ==================== BILLING HISTORY REPORT ROUTES ====================

  // Get billing history for report (admin sees all, client sees own)
  app.get("/api/reports/billing-history", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const { clientProfileId, startDate, endDate, paymentType, tab } = req.query;
      const isAdmin = sessionUser.role === "admin";
      const isClient = sessionUser.role === "client";

      if (!isAdmin && !isClient) {
        return res.status(403).json({ error: "Access denied" });
      }

      let targetClientProfileId: string | undefined;
      if (isClient) {
        targetClientProfileId = sessionUser.clientProfileId || undefined;
        if (!targetClientProfileId) {
          return res.json([]);
        }
      } else if (clientProfileId && typeof clientProfileId === "string") {
        targetClientProfileId = clientProfileId;
      }

      const billingRecords: any[] = [];
      const stripe = new (await import("stripe")).default(process.env.STRIPE_SECRET_KEY!);

      // Helper to get processing fee from Stripe
      async function getProcessingFee(chargeId: string): Promise<number> {
        try {
          const charge = await stripe.charges.retrieve(chargeId, { expand: ["balance_transaction"] });
          if (charge.balance_transaction && typeof charge.balance_transaction !== "string") {
            return charge.balance_transaction.fee / 100;
          }
        } catch (e) {
          console.error("Error fetching charge processing fee:", e);
        }
        return 0;
      }

      // Get date filters
      const filterStartDate = startDate ? new Date(startDate as string) : undefined;
      const filterEndDate = endDate ? new Date(endDate as string) : undefined;

      // 1. Get upfront payments (pay-as-you-go) from service requests
      if (!tab || tab === "pay_as_you_go") {
        const allServiceRequests = await storage.getAllServiceRequests();
        const paidServices = allServiceRequests.filter((sr) => {
          if (sr.clientPaymentStatus !== "paid") return false;
          if (!sr.stripePaymentIntentId) return false;
          if (!sr.clientPaymentAt) return false;
          
          if (targetClientProfileId) {
            return false; // Will filter by user's profile below
          }
          
          if (filterStartDate && new Date(sr.clientPaymentAt) < filterStartDate) return false;
          if (filterEndDate && new Date(sr.clientPaymentAt) > filterEndDate) return false;
          
          return true;
        });

        // Filter by client profile if needed
        let filteredServices = paidServices;
        if (targetClientProfileId) {
          const usersWithProfile = await storage.getAllUsers();
          const profileUserIds = usersWithProfile
            .filter((u) => u.clientProfileId === targetClientProfileId)
            .map((u) => u.id);
          
          filteredServices = allServiceRequests.filter((sr) => {
            if (sr.clientPaymentStatus !== "paid") return false;
            if (!sr.stripePaymentIntentId) return false;
            if (!sr.clientPaymentAt) return false;
            if (!profileUserIds.includes(sr.userId)) return false;
            if (filterStartDate && new Date(sr.clientPaymentAt) < filterStartDate) return false;
            if (filterEndDate && new Date(sr.clientPaymentAt) > filterEndDate) return false;
            return true;
          });
        }

        for (const sr of filteredServices) {
          const amount = sr.finalPrice ? parseFloat(sr.finalPrice) : 0;
          let processingFee = 0;
          
          if (sr.stripePaymentIntentId) {
            try {
              const pi = await stripe.paymentIntents.retrieve(sr.stripePaymentIntentId);
              if (pi.latest_charge) {
                const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge.id;
                processingFee = await getProcessingFee(chargeId);
              }
            } catch (e) {
              console.error("Error fetching payment intent:", e);
            }
          }

          const user = await storage.getUser(sr.userId);
          const clientProfile = user?.clientProfileId ? await storage.getClientProfileById(user.clientProfileId) : null;

          billingRecords.push({
            id: sr.id,
            type: "upfront_payment",
            recordType: "service",
            jobId: sr.id,
            jobType: "service",
            jobTitle: sr.projectName,
            clientName: clientProfile?.companyName || user?.fullName || "Unknown",
            clientProfileId: clientProfile?.id,
            date: sr.clientPaymentAt,
            amount,
            processingFee,
            netAmount: amount - processingFee,
            status: "Paid",
            stripePaymentIntentId: sr.stripePaymentIntentId,
            paymentType: "pay_as_you_go",
          });
        }

        // Same for bundle requests
        const allBundleRequests = await storage.getAllBundleRequests();
        let filteredBundles = allBundleRequests.filter((br) => {
          if (br.clientPaymentStatus !== "paid") return false;
          if (!br.stripePaymentIntentId) return false;
          if (!br.clientPaymentAt) return false;
          if (filterStartDate && new Date(br.clientPaymentAt) < filterStartDate) return false;
          if (filterEndDate && new Date(br.clientPaymentAt) > filterEndDate) return false;
          return true;
        });

        if (targetClientProfileId) {
          const usersWithProfile = await storage.getAllUsers();
          const profileUserIds = usersWithProfile
            .filter((u) => u.clientProfileId === targetClientProfileId)
            .map((u) => u.id);
          
          filteredBundles = filteredBundles.filter((br) => profileUserIds.includes(br.userId));
        }

        for (const br of filteredBundles) {
          const amount = br.finalPrice ? parseFloat(br.finalPrice) : 0;
          let processingFee = 0;

          if (br.stripePaymentIntentId) {
            try {
              const pi = await stripe.paymentIntents.retrieve(br.stripePaymentIntentId);
              if (pi.latest_charge) {
                const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge.id;
                processingFee = await getProcessingFee(chargeId);
              }
            } catch (e) {
              console.error("Error fetching bundle payment intent:", e);
            }
          }

          const user = await storage.getUser(br.userId);
          const clientProfile = user?.clientProfileId ? await storage.getClientProfileById(user.clientProfileId) : null;

          billingRecords.push({
            id: br.id,
            type: "upfront_payment",
            recordType: "bundle",
            jobId: br.id,
            jobType: "bundle",
            jobTitle: br.projectName,
            clientName: clientProfile?.companyName || user?.fullName || "Unknown",
            clientProfileId: clientProfile?.id,
            date: br.clientPaymentAt,
            amount,
            processingFee,
            netAmount: amount - processingFee,
            status: "Paid",
            stripePaymentIntentId: br.stripePaymentIntentId,
            paymentType: "pay_as_you_go",
          });
        }
      }

      // 2. Get monthly billing records
      if (!tab || tab === "monthly_payment") {
        const monthlyRecords = await storage.getAllMonthlyBillingRecords();
        let filteredMonthlyRecords = monthlyRecords.filter((rec) => {
          if (rec.status !== "completed") return false;
          if (!rec.paidAt) return false;
          if (filterStartDate && new Date(rec.paidAt) < filterStartDate) return false;
          if (filterEndDate && new Date(rec.paidAt) > filterEndDate) return false;
          if (targetClientProfileId && rec.clientProfileId !== targetClientProfileId) return false;
          return true;
        });

        for (const rec of filteredMonthlyRecords) {
          const clientProfile = await storage.getClientProfileById(rec.clientProfileId);
          const amount = rec.subtotalCents / 100;
          const processingFee = rec.processingFeeCents / 100;

          billingRecords.push({
            id: rec.id,
            type: "monthly_billing",
            recordType: rec.recordType,
            jobId: null,
            jobType: null,
            jobTitle: rec.recordType === "pack_exceeded" 
              ? `Pack Exceeded Services (${rec.servicesCount} jobs)` 
              : `Monthly Services (${rec.servicesCount} jobs)`,
            clientName: clientProfile?.companyName || "Unknown",
            clientProfileId: rec.clientProfileId,
            date: rec.paidAt,
            billingPeriod: rec.billingPeriod,
            amount,
            processingFee,
            netAmount: amount - processingFee,
            status: "Paid",
            stripePaymentIntentId: rec.stripePaymentIntentId,
            paymentType: rec.recordType === "pack_exceeded" ? "pack_exceeded" : "monthly_payment",
          });
        }
      }

      // 3. Get refunds as separate rows (negative amounts)
      const allRefunds = await storage.getAllRefunds();
      let filteredRefunds = allRefunds.filter((ref) => {
        if (ref.status !== "completed") return false;
        if (!ref.processedAt) return false;
        if (filterStartDate && new Date(ref.processedAt) < filterStartDate) return false;
        if (filterEndDate && new Date(ref.processedAt) > filterEndDate) return false;
        return true;
      });

      if (targetClientProfileId) {
        const usersWithProfile = await storage.getAllUsers();
        const profileUserIds = usersWithProfile
          .filter((u) => u.clientProfileId === targetClientProfileId)
          .map((u) => u.id);
        filteredRefunds = filteredRefunds.filter((ref) => profileUserIds.includes(ref.clientId));
      }

      for (const ref of filteredRefunds) {
        const refundAmount = parseFloat(ref.refundAmount);
        const user = await storage.getUser(ref.clientId);
        const clientProfile = user?.clientProfileId ? await storage.getClientProfileById(user.clientProfileId) : null;

        let jobTitle = "Refund";
        if (ref.serviceRequestId) {
          const sr = await storage.getServiceRequest(ref.serviceRequestId);
          jobTitle = sr ? `Refund: ${sr.projectName}` : "Refund: Service Request";
        } else if (ref.bundleRequestId) {
          const br = await storage.getBundleRequest(ref.bundleRequestId);
          jobTitle = br ? `Refund: ${br.projectName}` : "Refund: Bundle Request";
        }

        billingRecords.push({
          id: ref.id,
          type: "refund",
          recordType: ref.refundType,
          jobId: ref.serviceRequestId || ref.bundleRequestId,
          jobType: ref.requestType,
          jobTitle,
          clientName: clientProfile?.companyName || user?.fullName || "Unknown",
          clientProfileId: clientProfile?.id,
          date: ref.processedAt,
          amount: -refundAmount,
          processingFee: 0,
          netAmount: -refundAmount,
          status: "Refunded",
          stripeRefundId: ref.stripeRefundId,
          paymentType: "refund",
          reason: ref.reason,
        });
      }

      // Sort by date descending
      billingRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      res.json(billingRecords);
    } catch (error) {
      console.error("Error fetching billing history:", error);
      res.status(500).json({ error: "Failed to fetch billing history" });
    }
  });

  // Get billing summary for a client (for client dashboard)
  app.get("/api/reports/billing-summary", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const isAdmin = sessionUser.role === "admin";
      const isClient = sessionUser.role === "client";

      if (!isAdmin && !isClient) {
        return res.status(403).json({ error: "Access denied" });
      }

      const targetClientProfileId = isClient ? sessionUser.clientProfileId : (req.query.clientProfileId as string);
      
      if (!targetClientProfileId) {
        return res.json({ hasPayAsYouGo: false, hasMonthlyPayment: false, hasPackExceeded: false });
      }

      const clientProfile = await storage.getClientProfileById(targetClientProfileId);
      const currentPaymentConfig = clientProfile?.paymentConfiguration || "pay_as_you_go";

      // Check what payment types exist in history
      const monthlyRecords = await storage.getAllMonthlyBillingRecords();
      const hasMonthlyPayment = monthlyRecords.some(
        (rec) => rec.clientProfileId === targetClientProfileId && 
                 rec.recordType === "monthly_services" && 
                 rec.status === "completed"
      );
      const hasPackExceeded = monthlyRecords.some(
        (rec) => rec.clientProfileId === targetClientProfileId && 
                 rec.recordType === "pack_exceeded" && 
                 rec.status === "completed"
      );

      // Check for pay-as-you-go transactions
      const usersWithProfile = await storage.getAllUsers();
      const profileUserIds = usersWithProfile
        .filter((u) => u.clientProfileId === targetClientProfileId)
        .map((u) => u.id);

      const allServiceRequests = await storage.getAllServiceRequests();
      const hasPayAsYouGo = allServiceRequests.some(
        (sr) => profileUserIds.includes(sr.userId) && 
                sr.clientPaymentStatus === "paid" && 
                sr.stripePaymentIntentId
      );

      res.json({
        currentPaymentConfig,
        hasPayAsYouGo,
        hasMonthlyPayment,
        hasPackExceeded,
      });
    } catch (error) {
      console.error("Error fetching billing summary:", error);
      res.status(500).json({ error: "Failed to fetch billing summary" });
    }
  });

  // ==================== END PHASE 7 ROUTES ====================

  // ==================== MONTHLY PACKS ROUTES ====================

  // Get all monthly packs (admin only)
  app.get("/api/monthly-packs", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const packs = await storage.getAllMonthlyPacks();
      
      // Fetch services for each pack
      const packsWithServices = await Promise.all(
        packs.map(async (pack) => {
          const packServices = await storage.getMonthlyPackServices(pack.id);
          return { ...pack, services: packServices };
        })
      );
      
      res.json(packsWithServices);
    } catch (error) {
      console.error("Error fetching monthly packs:", error);
      res.status(500).json({ error: "Failed to fetch monthly packs" });
    }
  });

  // Get active monthly packs (for client subscription)
  app.get("/api/monthly-packs/active", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const packs = await storage.getActiveMonthlyPacks();
      
      // Fetch services for each pack
      const packsWithServices = await Promise.all(
        packs.map(async (pack) => {
          const packServices = await storage.getMonthlyPackServices(pack.id);
          return { ...pack, services: packServices };
        })
      );
      
      res.json(packsWithServices);
    } catch (error) {
      console.error("Error fetching active monthly packs:", error);
      res.status(500).json({ error: "Failed to fetch active monthly packs" });
    }
  });

  // Get single monthly pack
  app.get("/api/monthly-packs/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const pack = await storage.getMonthlyPack(req.params.id);
      if (!pack) {
        return res.status(404).json({ error: "Monthly pack not found" });
      }
      
      const packServices = await storage.getMonthlyPackServices(pack.id);
      res.json({ ...pack, services: packServices });
    } catch (error) {
      console.error("Error fetching monthly pack:", error);
      res.status(500).json({ error: "Failed to fetch monthly pack" });
    }
  });

  // Create monthly pack (admin only)
  app.post("/api/monthly-packs", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const { services, ...packData } = req.body;
      
      // Create the pack
      const pack = await storage.createMonthlyPack({
        ...packData,
        createdBy: sessionUserId,
      });
      
      // Create pack services
      if (services && Array.isArray(services)) {
        for (const service of services) {
          await storage.createMonthlyPackService({
            packId: pack.id,
            serviceId: service.serviceId,
            includedQuantity: service.includedQuantity,
          });
        }
      }
      
      const packServices = await storage.getMonthlyPackServices(pack.id);
      res.status(201).json({ ...pack, services: packServices });
    } catch (error) {
      console.error("Error creating monthly pack:", error);
      res.status(500).json({ error: "Failed to create monthly pack" });
    }
  });

  // Update monthly pack (admin only)
  app.patch("/api/monthly-packs/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const { services, ...packData } = req.body;
      
      // Update the pack
      const pack = await storage.updateMonthlyPack(req.params.id, packData);
      if (!pack) {
        return res.status(404).json({ error: "Monthly pack not found" });
      }
      
      // Update services if provided
      if (services && Array.isArray(services)) {
        // Delete existing services and recreate
        await storage.deleteMonthlyPackServicesByPack(pack.id);
        for (const service of services) {
          await storage.createMonthlyPackService({
            packId: pack.id,
            serviceId: service.serviceId,
            includedQuantity: service.includedQuantity,
          });
        }
      }
      
      const packServices = await storage.getMonthlyPackServices(pack.id);
      res.json({ ...pack, services: packServices });
    } catch (error) {
      console.error("Error updating monthly pack:", error);
      res.status(500).json({ error: "Failed to update monthly pack" });
    }
  });

  // Delete monthly pack (admin only)
  app.delete("/api/monthly-packs/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      // Delete associated services first
      await storage.deleteMonthlyPackServicesByPack(req.params.id);
      await storage.deleteMonthlyPack(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting monthly pack:", error);
      res.status(500).json({ error: "Failed to delete monthly pack" });
    }
  });

  // ==================== CLIENT MONTHLY PACK SUBSCRIPTION ROUTES ====================

  // Get client's subscriptions
  app.get("/api/monthly-pack-subscriptions", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      let clientProfileId: string | null = null;
      
      if (sessionUser.role === "admin" && req.query.clientProfileId) {
        clientProfileId = req.query.clientProfileId as string;
      } else if ((sessionUser.role === "client" || sessionUser.role === "client_member") && sessionUser.clientProfileId) {
        clientProfileId = sessionUser.clientProfileId;
      }

      if (!clientProfileId) {
        return res.status(400).json({ error: "Client profile not found" });
      }

      const subscriptions = await storage.getClientMonthlyPackSubscriptions(clientProfileId);
      
      // Enrich with pack details
      const enrichedSubscriptions = await Promise.all(
        subscriptions.map(async (sub) => {
          const pack = await storage.getMonthlyPack(sub.packId);
          const packServices = pack ? await storage.getMonthlyPackServices(pack.id) : [];
          
          // Get current month usage
          const now = new Date();
          const usage = await storage.getMonthlyPackUsageBySubscription(sub.id, now.getMonth() + 1, now.getFullYear());
          
          return {
            ...sub,
            pack: pack ? { ...pack, services: packServices } : null,
            currentMonthUsage: usage,
          };
        })
      );
      
      res.json(enrichedSubscriptions);
    } catch (error) {
      console.error("Error fetching monthly pack subscriptions:", error);
      res.status(500).json({ error: "Failed to fetch monthly pack subscriptions" });
    }
  });

  // Get client's active subscription
  app.get("/api/monthly-pack-subscriptions/active", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      let clientProfileId: string | null = null;
      
      if (sessionUser.role === "admin" && req.query.clientProfileId) {
        clientProfileId = req.query.clientProfileId as string;
      } else if ((sessionUser.role === "client" || sessionUser.role === "client_member") && sessionUser.clientProfileId) {
        clientProfileId = sessionUser.clientProfileId;
      }

      if (!clientProfileId) {
        return res.status(400).json({ error: "Client profile not found" });
      }

      const subscription = await storage.getActiveClientMonthlyPackSubscription(clientProfileId);
      
      if (!subscription) {
        return res.json(null);
      }
      
      const pack = await storage.getMonthlyPack(subscription.packId);
      const packServices = pack ? await storage.getMonthlyPackServices(pack.id) : [];
      
      // Get current month usage
      const now = new Date();
      const usage = await storage.getMonthlyPackUsageBySubscription(subscription.id, now.getMonth() + 1, now.getFullYear());
      
      res.json({
        ...subscription,
        pack: pack ? { ...pack, services: packServices } : null,
        currentMonthUsage: usage,
      });
    } catch (error) {
      console.error("Error fetching active monthly pack subscription:", error);
      res.status(500).json({ error: "Failed to fetch active monthly pack subscription" });
    }
  });

  // Subscribe to a monthly pack
  app.post("/api/monthly-pack-subscriptions", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Only admin can subscribe clients
      if (sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const { clientProfileId, packId, startDate } = req.body;
      
      if (!clientProfileId || !packId) {
        return res.status(400).json({ error: "Client profile ID and pack ID are required" });
      }

      // Verify pack exists and is active
      const pack = await storage.getMonthlyPack(packId);
      if (!pack || !pack.isActive) {
        return res.status(400).json({ error: "Invalid or inactive monthly pack" });
      }

      // Check if client already has an active subscription
      const existingActive = await storage.getActiveClientMonthlyPackSubscription(clientProfileId);
      if (existingActive) {
        return res.status(400).json({ error: "Client already has an active monthly pack subscription. Please cancel it first." });
      }

      const subscription = await storage.createClientMonthlyPackSubscription({
        clientProfileId,
        packId,
        startDate: startDate ? new Date(startDate) : new Date(),
        priceAtSubscription: pack.price,
      });
      
      res.status(201).json(subscription);
    } catch (error) {
      console.error("Error creating monthly pack subscription:", error);
      res.status(500).json({ error: "Failed to create monthly pack subscription" });
    }
  });

  // Cancel subscription
  app.patch("/api/monthly-pack-subscriptions/:id/cancel", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Access denied. Admin only." });
      }

      const subscription = await storage.getClientMonthlyPackSubscription(req.params.id);
      if (!subscription) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      const updated = await storage.updateClientMonthlyPackSubscription(req.params.id, {
        isActive: false,
        endDate: new Date(),
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error canceling monthly pack subscription:", error);
      res.status(500).json({ error: "Failed to cancel monthly pack subscription" });
    }
  });

  // Get usage for a subscription
  app.get("/api/monthly-pack-subscriptions/:id/usage", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }

      const subscription = await storage.getClientMonthlyPackSubscription(req.params.id);
      if (!subscription) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      // Verify access
      const hasAccess = sessionUser.role === "admin" || 
        (sessionUser.clientProfileId === subscription.clientProfileId);
      
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { month, year } = req.query;
      const now = new Date();
      const targetMonth = month ? parseInt(month as string) : now.getMonth() + 1;
      const targetYear = year ? parseInt(year as string) : now.getFullYear();

      const usage = await storage.getMonthlyPackUsageBySubscription(req.params.id, targetMonth, targetYear);
      
      // Enrich with pack service details
      const pack = await storage.getMonthlyPack(subscription.packId);
      const packServices = pack ? await storage.getMonthlyPackServices(pack.id) : [];
      
      // Build usage summary with included quantities
      const usageSummary = packServices.map((ps) => {
        const usageRecord = usage.find((u) => u.serviceId === ps.serviceId);
        return {
          serviceId: ps.serviceId,
          includedQuantity: ps.includedQuantity,
          usedQuantity: usageRecord?.usedQuantity ?? 0,
          remaining: Math.max(0, ps.includedQuantity - (usageRecord?.usedQuantity ?? 0)),
          overageQuantity: Math.max(0, (usageRecord?.usedQuantity ?? 0) - ps.includedQuantity),
        };
      });
      
      res.json({
        subscriptionId: subscription.id,
        month: targetMonth,
        year: targetYear,
        usage: usageSummary,
      });
    } catch (error) {
      console.error("Error fetching monthly pack usage:", error);
      res.status(500).json({ error: "Failed to fetch monthly pack usage" });
    }
  });

  // ==================== END MONTHLY PACKS ROUTES ====================

  // ==================== PACK PROFIT REPORT ====================

  // Get pack profit report data - Admin only
  app.get("/api/reports/pack-profit", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { startDate, endDate, vendorId, packId, status } = req.query;

      // Get all pack subscriptions
      const allSubscriptions = await storage.getAllClientPackSubscriptions();
      const allPacks = await storage.getAllServicePacks();
      const allVendorPackCosts = await storage.getAllVendorPackCosts();
      const allVendorProfiles = await storage.getAllVendorProfiles();
      const allClientProfiles = await storage.getAllClientProfiles();
      const allUsers = await storage.getAllUsers();

      // Build lookup maps
      const packMap: Record<string, typeof allPacks[0]> = {};
      allPacks.forEach(p => { packMap[p.id] = p; });
      
      const vendorProfileMap: Record<string, typeof allVendorProfiles[0]> = {};
      allVendorProfiles.forEach(vp => { vendorProfileMap[vp.userId] = vp; });
      
      const clientProfileMap: Record<string, typeof allClientProfiles[0]> = {};
      allClientProfiles.forEach(cp => { clientProfileMap[cp.id] = cp; });

      const userMap: Record<string, typeof allUsers[0]> = {};
      allUsers.forEach(u => { userMap[u.id] = u; });

      // Build vendor pack cost lookup: vendorId-packId -> cost
      const vendorPackCostMap: Record<string, number> = {};
      allVendorPackCosts.forEach(vpc => {
        vendorPackCostMap[`${vpc.vendorId}-${vpc.packId}`] = parseFloat(vpc.cost);
      });

      // Filter subscriptions
      let filteredSubscriptions = allSubscriptions.filter(sub => {
        // Date filtering
        if (startDate) {
          const start = new Date(startDate as string);
          if (sub.startDate < start) return false;
        }
        if (endDate) {
          const end = new Date(endDate as string);
          if (sub.startDate > end) return false;
        }
        
        // Vendor filter
        if (vendorId && vendorId !== "all" && sub.vendorAssigneeId !== vendorId) return false;
        
        // Pack filter
        if (packId && packId !== "all" && sub.packId !== packId) return false;
        
        // Status filter
        if (status === "active" && !sub.isActive) return false;
        if (status === "inactive" && sub.isActive) return false;
        
        return true;
      });

      // Calculate report rows
      const reportRows = filteredSubscriptions.map(sub => {
        const pack = packMap[sub.packId];
        const vendorProfile = sub.vendorAssigneeId ? vendorProfileMap[sub.vendorAssigneeId] : null;
        const clientProfile = sub.clientProfileId ? clientProfileMap[sub.clientProfileId] : null;
        const clientUser = sub.userId ? userMap[sub.userId] : null;

        const retailPrice = sub.priceAtSubscription ? parseFloat(sub.priceAtSubscription) : 
                           (pack?.price ? parseFloat(pack.price) : 0);
        
        // Get vendor cost for this pack-vendor combination
        const vendorCost = sub.vendorAssigneeId 
          ? (vendorPackCostMap[`${sub.vendorAssigneeId}-${sub.packId}`] || 0)
          : 0;
        
        const profit = retailPrice - vendorCost;
        const marginPercent = retailPrice > 0 ? (profit / retailPrice) * 100 : 0;

        return {
          id: sub.id,
          clientName: clientProfile?.companyName || clientUser?.username || "Unknown",
          clientEmail: clientUser?.email || "",
          packName: pack?.name || "Unknown Pack",
          vendorName: vendorProfile?.companyName || "Unassigned",
          vendorId: sub.vendorAssigneeId,
          retailPrice,
          vendorCost,
          profit,
          marginPercent,
          status: sub.stripeStatus || (sub.isActive ? "active" : "inactive"),
          startDate: sub.startDate,
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
        };
      });

      // Calculate summary
      const totalRetailPrice = reportRows.reduce((sum, row) => sum + row.retailPrice, 0);
      const totalVendorCost = reportRows.reduce((sum, row) => sum + row.vendorCost, 0);
      const totalProfit = reportRows.reduce((sum, row) => sum + row.profit, 0);
      const averageMargin = totalRetailPrice > 0 ? (totalProfit / totalRetailPrice) * 100 : 0;

      res.json({
        rows: reportRows,
        summary: {
          totalSubscriptions: reportRows.length,
          totalRetailPrice,
          totalVendorCost,
          totalProfit,
          averageMargin,
        },
        filters: {
          packs: allPacks.filter(p => p.isActive).map(p => ({ id: p.id, name: p.name })),
          vendors: allVendorProfiles.map(vp => ({ id: vp.userId, name: vp.companyName })),
        },
      });
    } catch (error) {
      console.error("Error fetching pack profit report:", error);
      res.status(500).json({ error: "Failed to fetch pack profit report" });
    }
  });

  // ==================== DEDUCT FROM ROYALTIES REPORT ====================

  // Get royalties deduction report data - Admin only
  app.get("/api/reports/royalties-deduction", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { tab, period, clientId, status } = req.query;
      const reportTab = (tab as string) || "services";
      const paymentPeriod = (period as string) || new Date().toISOString().slice(0, 7);

      const allUsers = await storage.getAllUsers();
      const allClientProfiles = await storage.getAllClientProfiles();
      const allServices = await storage.getAllServices();
      
      const userMap: Record<string, typeof allUsers[0]> = {};
      allUsers.forEach(u => { userMap[u.id] = u; });
      
      const clientProfileMap: Record<string, typeof allClientProfiles[0]> = {};
      allClientProfiles.forEach(cp => { clientProfileMap[cp.id] = cp; });

      const serviceMap: Record<string, typeof allServices[0]> = {};
      allServices.forEach(s => { serviceMap[s.id] = s; });

      // Get users that use "deduct_from_royalties" payment method
      const royaltiesUsers = allUsers.filter(u => u.paymentMethod === "deduct_from_royalties");
      const royaltiesUserIds = new Set(royaltiesUsers.map(u => u.id));
      
      // Build royalties client profiles for filter dropdown
      const royaltiesClientIds = new Set<string>();
      royaltiesUsers.forEach(u => {
        if (u.clientProfileId) royaltiesClientIds.add(u.clientProfileId);
      });
      const royaltiesClients = allClientProfiles.filter(cp => royaltiesClientIds.has(cp.id));

      if (reportTab === "services") {
        // Services tab - get service requests from royalties clients
        const allServiceRequests = await storage.getAllServiceRequests();
        
        let filteredRequests = allServiceRequests.filter(sr => {
          // Must be from a royalties client
          if (!sr.userId || !royaltiesUserIds.has(sr.userId)) return false;
          
          // Must be delivered
          if (sr.status !== "delivered" || !sr.deliveredAt) return false;
          
          // Filter by period (using deliveredAt)
          const deliveredMonth = new Date(sr.deliveredAt).toISOString().slice(0, 7);
          if (deliveredMonth !== paymentPeriod) return false;
          
          // Client filter
          if (clientId && clientId !== "all") {
            const user = userMap[sr.userId];
            if (user?.clientProfileId !== clientId) return false;
          }
          
          // For services, we use vendorPaymentStatus as proxy for royalties tracking
          if (status && status !== "all" && sr.vendorPaymentStatus !== status) return false;
          
          return true;
        });

        const rows = filteredRequests.map(sr => {
          const user = sr.userId ? userMap[sr.userId] : null;
          const clientProfile = user?.clientProfileId ? clientProfileMap[user.clientProfileId] : null;
          const service = sr.serviceId ? serviceMap[sr.serviceId] : null;
          
          return {
            id: sr.id,
            jobId: `SR-${sr.id.slice(0, 5).toUpperCase()}`,
            clientName: clientProfile?.companyName || user?.username || "Unknown",
            serviceName: service?.title || "Unknown Service",
            amount: sr.finalPrice ? parseFloat(sr.finalPrice) : 0,
            deliveredAt: sr.deliveredAt,
            paymentStatus: sr.vendorPaymentStatus || "pending",
          };
        });

        const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
        const pendingCount = rows.filter(r => r.paymentStatus === "pending").length;
        const paidCount = rows.filter(r => r.paymentStatus === "paid").length;

        res.json({
          tab: "services",
          period: paymentPeriod,
          rows,
          summary: {
            totalItems: rows.length,
            totalAmount,
            pendingCount,
            paidCount,
          },
          filters: {
            clients: royaltiesClients.map(cp => ({ id: cp.id, name: cp.companyName })),
          },
        });
      } else {
        // Packs tab - get pack subscriptions from royalties clients
        const allSubscriptions = await storage.getAllClientPackSubscriptions();
        const allPacks = await storage.getAllServicePacks();
        
        const packMap: Record<string, typeof allPacks[0]> = {};
        allPacks.forEach(p => { packMap[p.id] = p; });

        let filteredSubscriptions = allSubscriptions.filter(sub => {
          // Must be from a royalties client
          if (!sub.clientProfileId || !royaltiesClientIds.has(sub.clientProfileId)) return false;
          
          // Must be active
          if (!sub.isActive) return false;
          
          // Filter by period (using currentPeriodStart or startDate)
          const subPeriod = (sub.currentPeriodStart || sub.startDate).toISOString().slice(0, 7);
          if (subPeriod !== paymentPeriod) return false;
          
          // Client filter
          if (clientId && clientId !== "all" && sub.clientProfileId !== clientId) return false;
          
          // Status filter
          if (status && status !== "all" && sub.royaltiesPaymentStatus !== status) return false;
          
          return true;
        });

        const rows = filteredSubscriptions.map(sub => {
          const clientProfile = sub.clientProfileId ? clientProfileMap[sub.clientProfileId] : null;
          const clientUser = sub.userId ? userMap[sub.userId] : null;
          const pack = packMap[sub.packId];
          
          return {
            id: sub.id,
            subscriptionId: sub.id.slice(0, 8).toUpperCase(),
            clientName: clientProfile?.companyName || clientUser?.username || "Unknown",
            packName: pack?.name || "Unknown Pack",
            amount: sub.priceAtSubscription ? parseFloat(sub.priceAtSubscription) : 
                   (pack?.price ? parseFloat(pack.price) : 0),
            periodStart: sub.currentPeriodStart || sub.startDate,
            periodEnd: sub.currentPeriodEnd,
            paymentStatus: sub.royaltiesPaymentStatus || "pending",
          };
        });

        const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
        const pendingCount = rows.filter(r => r.paymentStatus === "pending").length;
        const paidCount = rows.filter(r => r.paymentStatus === "paid").length;

        res.json({
          tab: "packs",
          period: paymentPeriod,
          rows,
          summary: {
            totalItems: rows.length,
            totalAmount,
            pendingCount,
            paidCount,
          },
          filters: {
            clients: royaltiesClients.map(cp => ({ id: cp.id, name: cp.companyName })),
          },
        });
      }
    } catch (error) {
      console.error("Error fetching royalties deduction report:", error);
      res.status(500).json({ error: "Failed to fetch royalties deduction report" });
    }
  });

  // Mark royalties items as paid
  app.post("/api/reports/royalties-deduction/mark-paid", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { tab, ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No items provided" });
      }

      const now = new Date();

      if (tab === "services") {
        // Mark service requests as paid (using vendor payment tracking)
        for (const id of ids) {
          await storage.updateServiceRequest(id, {
            vendorPaymentStatus: "paid",
            vendorPaymentMarkedAt: now,
            vendorPaymentMarkedBy: sessionUserId,
          });
        }
      } else {
        // Mark pack subscriptions as paid
        for (const id of ids) {
          await storage.updateClientPackSubscription(id, {
            royaltiesPaymentStatus: "paid",
            royaltiesMarkedPaidAt: now,
            royaltiesMarkedPaidBy: sessionUserId,
          });
        }
      }

      res.json({ success: true, markedCount: ids.length });
    } catch (error) {
      console.error("Error marking royalties as paid:", error);
      res.status(500).json({ error: "Failed to mark as paid" });
    }
  });

  // Vendor Pack Payments Report - list pack subscriptions that need vendor payment
  app.get("/api/reports/vendor-payments/packs", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || !["admin", "vendor"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { period, vendorId, status } = req.query;
      const paymentPeriod = period as string || new Date().toISOString().slice(0, 7);

      const allSubscriptions = await storage.getAllClientPackSubscriptions();
      const allPacks = await storage.getAllServicePacks();
      const allUsers = await storage.getAllUsers();
      const vendorProfiles = await storage.getAllVendorProfiles();
      const vendorPackCosts = await storage.getAllVendorPackCosts();
      const clientProfiles = await storage.getClientProfiles();
      const clientCompanies = await storage.getClientCompanies();

      const packMap: Record<string, typeof allPacks[0]> = {};
      allPacks.forEach((p: typeof allPacks[0]) => { packMap[p.id] = p; });
      const userMap: Record<string, typeof allUsers[0]> = {};
      allUsers.forEach((u: typeof allUsers[0]) => { userMap[u.id] = u; });
      const vendorProfileMap: Record<string, typeof vendorProfiles[0]> = {};
      vendorProfiles.forEach((v: typeof vendorProfiles[0]) => { vendorProfileMap[v.id] = v; });
      const clientProfileMap: Record<string, typeof clientProfiles[0]> = {};
      clientProfiles.forEach((p: typeof clientProfiles[0]) => { clientProfileMap[p.id] = p; });
      const clientCompanyMap: Record<string, typeof clientCompanies[0]> = {};
      clientCompanies.forEach((c: typeof clientCompanies[0]) => { clientCompanyMap[c.id] = c; });

      // Build vendor pack cost lookup: packId -> vendorId -> cost
      const vendorPackCostMap: Record<string, Record<string, number>> = {};
      for (const vpc of vendorPackCosts) {
        if (!vendorPackCostMap[vpc.packId]) vendorPackCostMap[vpc.packId] = {};
        vendorPackCostMap[vpc.packId][vpc.vendorId] = parseFloat(vpc.cost || "0");
      }

      // Filter subscriptions by period (using currentPeriodStart)
      let filteredSubs = allSubscriptions.filter(sub => {
        // Must be active and have a vendor assigned
        if (!sub.isActive || !sub.vendorAssigneeId) return false;
        
        // Check if subscription period matches
        const periodStart = sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : new Date(sub.startDate);
        const subPeriod = sub.vendorPaymentPeriod || periodStart.toISOString().slice(0, 7);
        if (subPeriod !== paymentPeriod) return false;

        // Filter by payment status if specified
        if (status && sub.vendorPaymentStatus !== status) return false;

        return true;
      });

      // If vendor, filter to only their assignments
      if (sessionUser.role === "vendor") {
        filteredSubs = filteredSubs.filter(sub => sub.vendorAssigneeId === sessionUserId);
      }

      // Additional vendor filter from query (using vendorAssigneeId which is a user ID)
      if (vendorId && vendorId !== "all") {
        filteredSubs = filteredSubs.filter(sub => sub.vendorAssigneeId === vendorId);
      }

      // Group by vendor
      const vendorSummaries: Record<string, {
        vendorId: string;
        vendorName: string;
        subscriptions: {
          id: string;
          packName: string;
          clientName: string;
          vendorCost: number;
          paymentStatus: string;
          periodStart: string | null;
          periodEnd: string | null;
        }[];
        totalEarnings: number;
        pendingCount: number;
        paidCount: number;
      }> = {};

      for (const sub of filteredSubs) {
        const pack = sub.packId ? packMap[sub.packId] : null;
        const vendorUser = sub.vendorAssigneeId ? userMap[sub.vendorAssigneeId] : null;
        // Find vendor profile by userId
        const vendorProfile = vendorUser?.vendorId ? vendorProfileMap[vendorUser.vendorId] : 
                              vendorProfiles.find((v: typeof vendorProfiles[0]) => v.userId === sub.vendorAssigneeId) || null;
        const clientUser = sub.userId ? userMap[sub.userId] : null;

        const vendorIdKey = sub.vendorAssigneeId || "unassigned";
        const vendorName = vendorProfile?.companyName || vendorUser?.username || "Unassigned";

        // Get vendor cost from vendorPackCosts table
        let vendorCost = parseFloat(sub.vendorCost || "0");
        if (vendorCost === 0 && pack && vendorProfile) {
          vendorCost = vendorPackCostMap[pack.id]?.[vendorProfile.id] || 0;
        }

        if (!vendorSummaries[vendorIdKey]) {
          vendorSummaries[vendorIdKey] = {
            vendorId: vendorIdKey,
            vendorName,
            subscriptions: [],
            totalEarnings: 0,
            pendingCount: 0,
            paidCount: 0,
          };
        }

        // Use clientCompany name if available, then clientProfile companyName, then user name
        let clientName = "Unknown";
        if (sub.clientCompanyId && clientCompanyMap[sub.clientCompanyId]) {
          clientName = clientCompanyMap[sub.clientCompanyId].name;
        } else if (sub.clientProfileId && clientProfileMap[sub.clientProfileId]) {
          clientName = clientProfileMap[sub.clientProfileId].companyName || clientUser?.username || "Unknown";
        } else if (clientUser) {
          // Check if user has a clientCompanyId or clientProfileId
          if (clientUser.clientCompanyId && clientCompanyMap[clientUser.clientCompanyId]) {
            clientName = clientCompanyMap[clientUser.clientCompanyId].name;
          } else if (clientUser.clientProfileId && clientProfileMap[clientUser.clientProfileId]) {
            clientName = clientProfileMap[clientUser.clientProfileId].companyName || clientUser.username;
          } else {
            clientName = clientUser.username;
          }
        }

        vendorSummaries[vendorIdKey].subscriptions.push({
          id: sub.id,
          packName: pack?.name || "Unknown Pack",
          clientName,
          vendorCost,
          paymentStatus: sub.vendorPaymentStatus || "pending",
          periodStart: sub.currentPeriodStart?.toISOString() || null,
          periodEnd: sub.currentPeriodEnd?.toISOString() || null,
        });

        vendorSummaries[vendorIdKey].totalEarnings += vendorCost;
        if (sub.vendorPaymentStatus === "paid") {
          vendorSummaries[vendorIdKey].paidCount++;
        } else {
          vendorSummaries[vendorIdKey].pendingCount++;
        }
      }

      res.json({
        period: paymentPeriod,
        vendors: Object.values(vendorSummaries).sort((a, b) => b.totalEarnings - a.totalEarnings),
      });
    } catch (error) {
      console.error("Error fetching vendor pack payments:", error);
      res.status(500).json({ error: "Failed to fetch vendor pack payments" });
    }
  });

  // Mark pack subscriptions as paid for vendors
  app.post("/api/reports/vendor-payments/packs/mark-paid", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { subscriptionIds, period } = req.body;
      if (!Array.isArray(subscriptionIds) || subscriptionIds.length === 0) {
        return res.status(400).json({ error: "No subscriptions provided" });
      }

      const now = new Date();
      const paymentPeriod = period || now.toISOString().slice(0, 7);

      for (const subId of subscriptionIds) {
        await storage.updateClientPackSubscription(subId, {
          vendorPaymentStatus: "paid",
          vendorPaymentPeriod: paymentPeriod,
          vendorPaymentMarkedAt: now,
          vendorPaymentMarkedBy: sessionUserId,
        });
      }

      res.json({ success: true, markedCount: subscriptionIds.length });
    } catch (error) {
      console.error("Error marking pack subscriptions as paid:", error);
      res.status(500).json({ error: "Failed to mark subscriptions as paid" });
    }
  });

  // ==================== END REPORTS ====================

  // ==================== REFUND MANAGEMENT ====================

  // Get all refunds (admin only)
  app.get("/api/refunds", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const refunds = await storage.getAllRefunds();
      
      // Enrich with client and request details
      const enrichedRefunds = await Promise.all(refunds.map(async (refund) => {
        const client = await storage.getUser(refund.clientId);
        const requestedBy = await storage.getUser(refund.requestedBy);
        const processedBy = refund.processedBy ? await storage.getUser(refund.processedBy) : null;
        
        let serviceRequest = null;
        let bundleRequest = null;
        let service = null;
        let bundle = null;
        
        if (refund.serviceRequestId) {
          serviceRequest = await storage.getServiceRequest(refund.serviceRequestId);
          if (serviceRequest) {
            service = await storage.getService(serviceRequest.serviceId);
          }
        }
        if (refund.bundleRequestId) {
          bundleRequest = await storage.getBundleRequest(refund.bundleRequestId);
          if (bundleRequest) {
            bundle = await storage.getBundle(bundleRequest.bundleId);
          }
        }
        
        return {
          ...refund,
          client,
          requestedByUser: requestedBy,
          processedByUser: processedBy,
          serviceRequest,
          bundleRequest,
          service,
          bundle
        };
      }));
      
      res.json(enrichedRefunds);
    } catch (error) {
      console.error("Error fetching refunds:", error);
      res.status(500).json({ error: "Failed to fetch refunds" });
    }
  });

  // Get refunds by client
  app.get("/api/refunds/client/:clientId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { clientId } = req.params;
      const refunds = await storage.getRefundsByClient(clientId);
      
      // Enrich with request details
      const enrichedRefunds = await Promise.all(refunds.map(async (refund) => {
        let serviceRequest = null;
        let bundleRequest = null;
        let service = null;
        let bundle = null;
        
        if (refund.serviceRequestId) {
          serviceRequest = await storage.getServiceRequest(refund.serviceRequestId);
          if (serviceRequest) {
            service = await storage.getService(serviceRequest.serviceId);
          }
        }
        if (refund.bundleRequestId) {
          bundleRequest = await storage.getBundleRequest(refund.bundleRequestId);
          if (bundleRequest) {
            bundle = await storage.getBundle(bundleRequest.bundleId);
          }
        }
        
        return {
          ...refund,
          serviceRequest,
          bundleRequest,
          service,
          bundle
        };
      }));
      
      res.json(enrichedRefunds);
    } catch (error) {
      console.error("Error fetching client refunds:", error);
      res.status(500).json({ error: "Failed to fetch client refunds" });
    }
  });

  // Get single refund
  app.get("/api/refunds/:id", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const refund = await storage.getRefund(req.params.id);
      if (!refund) {
        return res.status(404).json({ error: "Refund not found" });
      }
      res.json(refund);
    } catch (error) {
      console.error("Error fetching refund:", error);
      res.status(500).json({ error: "Failed to fetch refund" });
    }
  });

  // Create a refund (admin only)
  app.post("/api/refunds", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const {
        requestType,
        serviceRequestId,
        bundleRequestId,
        clientId,
        refundType,
        refundAmount,
        reason,
        notes,
      } = req.body;

      // Validate required fields
      if (!requestType || !clientId || !refundType || !refundAmount || !reason) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      if (!["service_request", "bundle_request"].includes(requestType)) {
        return res.status(400).json({ error: "Invalid request type" });
      }
      
      if (!["full", "partial", "manual"].includes(refundType)) {
        return res.status(400).json({ error: "Invalid refund type" });
      }

      // Fetch the job to get the original amount and Stripe payment intent
      let originalAmount: number = 0;
      let stripePaymentIntentId: string | null = null;
      let jobUserId: string | null = null;
      
      if (requestType === "service_request" && serviceRequestId) {
        const serviceRequest = await storage.getServiceRequest(serviceRequestId);
        if (!serviceRequest) {
          return res.status(404).json({ error: "Service request not found" });
        }
        if (!serviceRequest.finalPrice) {
          return res.status(400).json({ error: "Service request has no final price" });
        }
        originalAmount = parseFloat(serviceRequest.finalPrice);
        stripePaymentIntentId = serviceRequest.stripePaymentIntentId || null;
        jobUserId = serviceRequest.userId;
        
        // If no payment intent on the service request, check the payments table
        if (!stripePaymentIntentId) {
          const payments = await storage.getPaymentsByServiceRequest(serviceRequestId);
          const successfulPayment = payments.find(p => p.status === "succeeded" && p.stripePaymentIntentId);
          if (successfulPayment) {
            stripePaymentIntentId = successfulPayment.stripePaymentIntentId;
          }
        }
      } else if (requestType === "bundle_request" && bundleRequestId) {
        const bundleRequest = await storage.getBundleRequest(bundleRequestId);
        if (!bundleRequest) {
          return res.status(404).json({ error: "Bundle request not found" });
        }
        if (!bundleRequest.finalPrice) {
          return res.status(400).json({ error: "Bundle request has no final price" });
        }
        originalAmount = parseFloat(bundleRequest.finalPrice);
        stripePaymentIntentId = bundleRequest.stripePaymentIntentId || null;
        jobUserId = bundleRequest.userId;
        
        // If no payment intent on the bundle request, check the payments table
        if (!stripePaymentIntentId) {
          const payments = await storage.getPaymentsByBundleRequest(bundleRequestId);
          const successfulPayment = payments.find(p => p.status === "succeeded" && p.stripePaymentIntentId);
          if (successfulPayment) {
            stripePaymentIntentId = successfulPayment.stripePaymentIntentId;
          }
        }
      } else {
        return res.status(400).json({ error: "Must provide either serviceRequestId or bundleRequestId" });
      }
      
      // For non-manual refunds, require a Stripe payment intent
      if (refundType !== "manual" && !stripePaymentIntentId) {
        return res.status(400).json({ 
          error: "No Stripe payment found for this job. Use 'Manual' refund type if this was paid outside of Stripe." 
        });
      }

      // Verify client ownership
      if (jobUserId !== clientId) {
        return res.status(400).json({ error: "Client does not own this job" });
      }

      // Calculate remaining refundable amount (prevent over-refunds)
      let existingRefunds: any[] = [];
      if (requestType === "service_request" && serviceRequestId) {
        existingRefunds = await storage.getRefundsByServiceRequest(serviceRequestId);
      } else if (bundleRequestId) {
        existingRefunds = await storage.getRefundsByBundleRequest(bundleRequestId);
      }
      
      const totalRefunded = existingRefunds
        .filter((r: any) => r.status === "completed")
        .reduce((sum: number, r: any) => sum + parseFloat(r.refundAmount), 0);
      
      const remainingRefundable = originalAmount - totalRefunded;
      
      const refundAmountNum = parseFloat(refundAmount);
      if (refundAmountNum <= 0) {
        return res.status(400).json({ error: "Refund amount must be greater than zero" });
      }
      
      if (refundAmountNum > remainingRefundable) {
        return res.status(400).json({ 
          error: `Refund amount exceeds remaining refundable amount ($${remainingRefundable.toFixed(2)})` 
        });
      }

      // For manual refunds, mark as completed immediately
      // For Stripe refunds, start as pending and process via Stripe
      const isManual = refundType === "manual";
      
      const refund = await storage.createRefund({
        requestType,
        serviceRequestId: serviceRequestId || null,
        bundleRequestId: bundleRequestId || null,
        clientId,
        refundType,
        originalAmount: originalAmount.toString(),
        refundAmount: refundAmountNum.toString(),
        reason,
        notes: notes || null,
        status: isManual ? "completed" : "pending",
        stripePaymentIntentId,
        requestedBy: sessionUserId,
        processedBy: isManual ? sessionUserId : null,
        processedAt: isManual ? new Date() : null,
      });

      res.status(201).json(refund);
    } catch (error) {
      console.error("Error creating refund:", error);
      res.status(500).json({ error: "Failed to create refund" });
    }
  });

  // Process a refund via Stripe (admin only)
  app.post("/api/refunds/:id/process", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const refund = await storage.getRefund(req.params.id);
      if (!refund) {
        return res.status(404).json({ error: "Refund not found" });
      }

      if (refund.status !== "pending") {
        return res.status(400).json({ error: "Refund is not in pending status" });
      }

      if (refund.refundType === "manual") {
        return res.status(400).json({ error: "Manual refunds cannot be processed via Stripe" });
      }

      // Update status to processing
      await storage.updateRefund(refund.id, { status: "processing" });

      try {
        // Process via Stripe
        if (!refund.stripePaymentIntentId) {
          throw new Error("No Stripe payment intent ID found for this refund");
        }

        const stripeRefund = await stripeService.createRefund(
          refund.stripePaymentIntentId,
          Math.round(parseFloat(refund.refundAmount) * 100) // Convert to cents
        );

        // Update refund as completed
        const updatedRefund = await storage.updateRefund(refund.id, {
          status: "completed",
          stripeRefundId: stripeRefund.id,
          processedBy: sessionUserId,
          processedAt: new Date()
        });

        res.json(updatedRefund);
      } catch (stripeError: any) {
        // Update refund as failed
        await storage.updateRefund(refund.id, {
          status: "failed",
          errorMessage: stripeError.message || "Stripe refund failed"
        });
        
        res.status(500).json({ 
          error: "Stripe refund failed", 
          details: stripeError.message 
        });
      }
    } catch (error) {
      console.error("Error processing refund:", error);
      res.status(500).json({ error: "Failed to process refund" });
    }
  });

  // Get refundable jobs for a client (service requests and bundle requests with Stripe payments)
  app.get("/api/refunds/refundable/:clientId", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { clientId } = req.params;
      
      // Get service requests for this client
      const allServiceRequests = await storage.getServiceRequestsByUser(clientId);
      const serviceRequests = allServiceRequests.filter((sr: any) => 
        sr.finalPrice && parseFloat(sr.finalPrice) > 0
      );
      
      // Get bundle requests for this client
      const allBundleRequests = await storage.getBundleRequestsByUser(clientId);
      const bundleRequests = allBundleRequests.filter((br: any) => 
        br.finalPrice && parseFloat(br.finalPrice) > 0
      );
      
      // Enrich with service/bundle info
      const enrichedServiceRequests = await Promise.all(serviceRequests.map(async (sr: any) => {
        const service = await storage.getService(sr.serviceId);
        const existingRefunds = await storage.getRefundsByServiceRequest(sr.id);
        const totalRefunded = existingRefunds
          .filter((r: any) => r.status === "completed")
          .reduce((sum: number, r: any) => sum + parseFloat(r.refundAmount), 0);
        
        return {
          ...sr,
          service,
          existingRefunds,
          totalRefunded,
          remainingRefundable: Math.max(0, parseFloat(sr.finalPrice!) - totalRefunded)
        };
      }));
      
      const enrichedBundleRequests = await Promise.all(bundleRequests.map(async (br: any) => {
        const bundle = await storage.getBundle(br.bundleId);
        const existingRefunds = await storage.getRefundsByBundleRequest(br.id);
        const totalRefunded = existingRefunds
          .filter((r: any) => r.status === "completed")
          .reduce((sum: number, r: any) => sum + parseFloat(r.refundAmount), 0);
        
        return {
          ...br,
          bundle,
          existingRefunds,
          totalRefunded,
          remainingRefundable: Math.max(0, parseFloat(br.finalPrice!) - totalRefunded)
        };
      }));
      
      res.json({
        serviceRequests: enrichedServiceRequests,
        bundleRequests: enrichedBundleRequests
      });
    } catch (error) {
      console.error("Error fetching refundable jobs:", error);
      res.status(500).json({ error: "Failed to fetch refundable jobs" });
    }
  });

  // ==================== END REFUND MANAGEMENT ====================

  // ==================== CLIENT INVOICING REPORT ====================

  // Get client invoicing summary for a specific month
  app.get("/api/reports/client-invoicing", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { month, year } = req.query;
      if (!month || !year) {
        return res.status(400).json({ error: "Month and year are required" });
      }

      const selectedMonth = parseInt(month as string);
      const selectedYear = parseInt(year as string);

      // Calculate month boundaries
      const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
      const monthEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);

      // Get all clients with their profiles
      const allUsers = await storage.getAllUsers();
      const clients = allUsers.filter((u: any) => u.role === "client" || u.role === "client_member");
      
      // Get all client profiles for payment configuration
      const clientProfiles = await storage.getAllClientProfiles();
      const profileMap = new Map(clientProfiles.map((p: any) => [p.id, p]));
      
      // Get all services and bundles for enrichment
      const allServices = await storage.getAllServices();
      const serviceMap = new Map(allServices.map((s: any) => [s.id, s]));
      const allBundles = await storage.getAllBundles();
      const bundleMap = new Map(allBundles.map((b: any) => [b.id, b]));
      
      // Get all service packs for enrichment
      const allPacks = await storage.getAllServicePacks();
      const packMap = new Map(allPacks.map((p: any) => [p.id, p]));
      
      // Get all service requests
      const allServiceRequests = await storage.getAllServiceRequests();
      
      // Get all bundle requests
      const allBundleRequests = await storage.getAllBundleRequests();
      
      // Get all pack subscriptions
      const allPackSubscriptions = await storage.getAllClientPackSubscriptions();

      const invoiceSummaries: any[] = [];

      for (const client of clients) {
        // Get client's payment configuration
        const profile = client.clientProfileId ? profileMap.get(client.clientProfileId) : null;
        const paymentConfig = profile?.paymentConfiguration || client.paymentMethod || "pay_as_you_go";
        
        // Filter service requests based on payment type
        let clientServiceRequests = allServiceRequests.filter((sr: any) => sr.userId === client.id);
        let filteredServiceRequests: any[] = [];
        
        if (paymentConfig === "pay_as_you_go") {
          // For Pay-as-you-Go: services SUBMITTED within the month
          filteredServiceRequests = clientServiceRequests.filter((sr: any) => {
            if (!sr.createdAt) return false;
            const createdDate = new Date(sr.createdAt);
            return createdDate >= monthStart && createdDate <= monthEnd && 
                   sr.finalPrice && parseFloat(sr.finalPrice) > 0;
          });
        } else if (paymentConfig === "monthly_payment") {
          // For Monthly Payment: services DELIVERED within the month
          filteredServiceRequests = clientServiceRequests.filter((sr: any) => {
            if (!sr.deliveredAt) return false;
            const deliveredDate = new Date(sr.deliveredAt);
            return deliveredDate >= monthStart && deliveredDate <= monthEnd && 
                   sr.finalPrice && parseFloat(sr.finalPrice) > 0;
          });
        } else if (paymentConfig === "deduct_from_royalties") {
          // For Deduct from Royalties: services DELIVERED within the month
          filteredServiceRequests = clientServiceRequests.filter((sr: any) => {
            if (!sr.deliveredAt) return false;
            const deliveredDate = new Date(sr.deliveredAt);
            return deliveredDate >= monthStart && deliveredDate <= monthEnd && 
                   sr.finalPrice && parseFloat(sr.finalPrice) > 0;
          });
        }
        
        // Filter bundle requests based on payment type
        let clientBundleRequests = allBundleRequests.filter((br: any) => br.userId === client.id);
        let filteredBundleRequests: any[] = [];
        
        if (paymentConfig === "pay_as_you_go") {
          // For Pay-as-you-Go: bundles SUBMITTED within the month
          filteredBundleRequests = clientBundleRequests.filter((br: any) => {
            if (!br.createdAt) return false;
            const createdDate = new Date(br.createdAt);
            return createdDate >= monthStart && createdDate <= monthEnd && 
                   br.finalPrice && parseFloat(br.finalPrice) > 0;
          });
        } else if (paymentConfig === "monthly_payment") {
          // For Monthly Payment: bundles DELIVERED within the month
          filteredBundleRequests = clientBundleRequests.filter((br: any) => {
            if (!br.deliveredAt) return false;
            const deliveredDate = new Date(br.deliveredAt);
            return deliveredDate >= monthStart && deliveredDate <= monthEnd && 
                   br.finalPrice && parseFloat(br.finalPrice) > 0;
          });
        } else if (paymentConfig === "deduct_from_royalties") {
          // For Deduct from Royalties: bundles DELIVERED within the month
          filteredBundleRequests = clientBundleRequests.filter((br: any) => {
            if (!br.deliveredAt) return false;
            const deliveredDate = new Date(br.deliveredAt);
            return deliveredDate >= monthStart && deliveredDate <= monthEnd && 
                   br.finalPrice && parseFloat(br.finalPrice) > 0;
          });
        }
        
        // Filter pack subscriptions - subscription/renewal date in month
        const clientPackSubs = allPackSubscriptions.filter((ps: any) => {
          if (ps.userId !== client.id && ps.clientProfileId !== client.clientProfileId) return false;
          if (!ps.startDate) return false; // Guard against null startDate
          
          // Check if subscription started this month
          const startDate = new Date(ps.startDate);
          if (isNaN(startDate.getTime())) return false; // Guard against invalid dates
          const startedThisMonth = startDate >= monthStart && startDate <= monthEnd;
          
          // Check if renewal (currentPeriodStart) is in this month
          let renewedThisMonth = false;
          if (ps.currentPeriodStart) {
            const periodStart = new Date(ps.currentPeriodStart);
            if (!isNaN(periodStart.getTime())) {
              renewedThisMonth = periodStart >= monthStart && periodStart <= monthEnd;
            }
          }
          
          return (startedThisMonth || renewedThisMonth) && ps.priceAtSubscription && parseFloat(ps.priceAtSubscription) > 0;
        });
        
        // Calculate totals
        const adHocTotal = filteredServiceRequests.reduce((sum: number, sr: any) => 
          sum + parseFloat(sr.finalPrice || "0"), 0);
        const bundleTotal = filteredBundleRequests.reduce((sum: number, br: any) => 
          sum + parseFloat(br.finalPrice || "0"), 0);
        const packTotal = clientPackSubs.reduce((sum: number, ps: any) => 
          sum + parseFloat(ps.priceAtSubscription || "0"), 0);
        const grandTotal = adHocTotal + bundleTotal + packTotal;
        
        // Only include clients with activity
        if (grandTotal > 0) {
          invoiceSummaries.push({
            clientId: client.id,
            clientName: client.username,
            clientEmail: client.email,
            paymentMethod: paymentConfig,
            adHocCount: filteredServiceRequests.length,
            adHocTotal,
            bundleCount: filteredBundleRequests.length,
            bundleTotal,
            packCount: clientPackSubs.length,
            packTotal,
            grandTotal,
            // Store IDs for detail view
            serviceRequestIds: filteredServiceRequests.map((sr: any) => sr.id),
            bundleRequestIds: filteredBundleRequests.map((br: any) => br.id),
            packSubscriptionIds: clientPackSubs.map((ps: any) => ps.id),
          });
        }
      }
      
      // Sort by client name
      invoiceSummaries.sort((a, b) => a.clientName.localeCompare(b.clientName));
      
      res.json({
        month: selectedMonth,
        year: selectedYear,
        invoices: invoiceSummaries,
        totals: {
          adHocTotal: invoiceSummaries.reduce((sum, inv) => sum + inv.adHocTotal, 0),
          bundleTotal: invoiceSummaries.reduce((sum, inv) => sum + inv.bundleTotal, 0),
          packTotal: invoiceSummaries.reduce((sum, inv) => sum + inv.packTotal, 0),
          grandTotal: invoiceSummaries.reduce((sum, inv) => sum + inv.grandTotal, 0),
        }
      });
    } catch (error) {
      console.error("Error fetching client invoicing report:", error);
      res.status(500).json({ error: "Failed to fetch client invoicing report" });
    }
  });

  // Get invoice detail for a specific client and month
  app.get("/api/reports/client-invoicing/:clientId/detail", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { clientId } = req.params;
      const { month, year } = req.query;
      
      if (!month || !year) {
        return res.status(400).json({ error: "Month and year are required" });
      }

      const selectedMonth = parseInt(month as string);
      const selectedYear = parseInt(year as string);

      // Calculate month boundaries
      const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
      const monthEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);

      // Get client info
      const client = await storage.getUser(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      // Get client's payment configuration
      const clientProfiles = await storage.getAllClientProfiles();
      const profile = client.clientProfileId ? clientProfiles.find((p: any) => p.id === client.clientProfileId) : null;
      const paymentConfig = profile?.paymentConfiguration || client.paymentMethod || "pay_as_you_go";
      
      // Get all services and bundles for enrichment
      const allServices = await storage.getAllServices();
      const serviceMap = new Map(allServices.map((s: any) => [s.id, s]));
      const allBundles = await storage.getAllBundles();
      const bundleMap = new Map(allBundles.map((b: any) => [b.id, b]));
      const allPacks = await storage.getAllServicePacks();
      const packMap = new Map(allPacks.map((p: any) => [p.id, p]));
      
      // Get service requests
      const allServiceRequests = await storage.getServiceRequestsByUser(clientId);
      let filteredServiceRequests: any[] = [];
      
      if (paymentConfig === "pay_as_you_go") {
        filteredServiceRequests = allServiceRequests.filter((sr: any) => {
          if (!sr.createdAt) return false;
          const createdDate = new Date(sr.createdAt);
          return createdDate >= monthStart && createdDate <= monthEnd && 
                 sr.finalPrice && parseFloat(sr.finalPrice) > 0;
        });
      } else {
        // Monthly payment or deduct from royalties - use deliveredAt
        filteredServiceRequests = allServiceRequests.filter((sr: any) => {
          if (!sr.deliveredAt) return false;
          const deliveredDate = new Date(sr.deliveredAt);
          return deliveredDate >= monthStart && deliveredDate <= monthEnd && 
                 sr.finalPrice && parseFloat(sr.finalPrice) > 0;
        });
      }
      
      // Enrich service requests
      const enrichedServiceRequests = filteredServiceRequests.map((sr: any) => {
        const service = serviceMap.get(sr.serviceId);
        return {
          id: sr.id,
          type: "ad_hoc",
          serviceName: service?.title || "Unknown Service",
          date: paymentConfig === "pay_as_you_go" ? sr.createdAt : sr.deliveredAt,
          status: sr.status,
          amount: parseFloat(sr.finalPrice || "0"),
        };
      });
      
      // Get bundle requests
      const allBundleRequests = await storage.getBundleRequestsByUser(clientId);
      let filteredBundleRequests: any[] = [];
      
      if (paymentConfig === "pay_as_you_go") {
        filteredBundleRequests = allBundleRequests.filter((br: any) => {
          if (!br.createdAt) return false;
          const createdDate = new Date(br.createdAt);
          return createdDate >= monthStart && createdDate <= monthEnd && 
                 br.finalPrice && parseFloat(br.finalPrice) > 0;
        });
      } else {
        filteredBundleRequests = allBundleRequests.filter((br: any) => {
          if (!br.deliveredAt) return false;
          const deliveredDate = new Date(br.deliveredAt);
          return deliveredDate >= monthStart && deliveredDate <= monthEnd && 
                 br.finalPrice && parseFloat(br.finalPrice) > 0;
        });
      }
      
      // Enrich bundle requests
      const enrichedBundleRequests = filteredBundleRequests.map((br: any) => {
        const bundle = bundleMap.get(br.bundleId);
        return {
          id: br.id,
          type: "bundle",
          serviceName: bundle?.name || "Unknown Bundle",
          date: paymentConfig === "pay_as_you_go" ? br.createdAt : br.deliveredAt,
          status: br.status,
          amount: parseFloat(br.finalPrice || "0"),
        };
      });
      
      // Get pack subscriptions
      const allPackSubscriptions = await storage.getAllClientPackSubscriptions();
      const clientPackSubs = allPackSubscriptions.filter((ps: any) => {
        if (ps.userId !== clientId && ps.clientProfileId !== client.clientProfileId) return false;
        if (!ps.startDate) return false; // Guard against null startDate
        
        const startDate = new Date(ps.startDate);
        if (isNaN(startDate.getTime())) return false; // Guard against invalid dates
        const startedThisMonth = startDate >= monthStart && startDate <= monthEnd;
        
        let renewedThisMonth = false;
        if (ps.currentPeriodStart) {
          const periodStart = new Date(ps.currentPeriodStart);
          if (!isNaN(periodStart.getTime())) {
            renewedThisMonth = periodStart >= monthStart && periodStart <= monthEnd;
          }
        }
        
        return (startedThisMonth || renewedThisMonth) && ps.priceAtSubscription && parseFloat(ps.priceAtSubscription) > 0;
      });
      
      // Enrich pack subscriptions
      const enrichedPackSubs = clientPackSubs.map((ps: any) => {
        const pack = packMap.get(ps.packId);
        const isRenewal = ps.currentPeriodStart && new Date(ps.currentPeriodStart) >= monthStart;
        return {
          id: ps.id,
          type: "pack",
          serviceName: pack?.name || "Unknown Pack",
          date: isRenewal ? ps.currentPeriodStart : ps.startDate,
          status: ps.isActive ? "active" : "cancelled",
          amount: parseFloat(ps.priceAtSubscription || "0"),
          isRenewal,
        };
      });
      
      // Combine all items and calculate totals
      const allItems = [...enrichedServiceRequests, ...enrichedBundleRequests, ...enrichedPackSubs];
      allItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      const adHocTotal = enrichedServiceRequests.reduce((sum, item) => sum + item.amount, 0);
      const bundleTotal = enrichedBundleRequests.reduce((sum, item) => sum + item.amount, 0);
      const packTotal = enrichedPackSubs.reduce((sum, item) => sum + item.amount, 0);
      
      res.json({
        client: {
          id: client.id,
          name: client.username,
          email: client.email,
          paymentMethod: paymentConfig,
          companyName: profile?.companyName,
          billingAddress: profile?.billingAddress,
        },
        billingPeriod: {
          month: selectedMonth,
          year: selectedYear,
        },
        items: allItems,
        totals: {
          adHocCount: enrichedServiceRequests.length,
          adHocTotal,
          bundleCount: enrichedBundleRequests.length,
          bundleTotal,
          packCount: enrichedPackSubs.length,
          packTotal,
          grandTotal: adHocTotal + bundleTotal + packTotal,
        }
      });
    } catch (error) {
      console.error("Error fetching invoice detail:", error);
      res.status(500).json({ error: "Failed to fetch invoice detail" });
    }
  });

  // ==================== END CLIENT INVOICING REPORT ====================

  // ==================== CLIENT INVOICE VIEW (for client role) ====================

  // Get client's own invoice data for a specific month
  app.get("/api/reports/my-invoice", async (req, res) => {
    try {
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser || sessionUser.role !== "client") {
        return res.status(403).json({ error: "Client access required" });
      }

      const { month, year } = req.query;
      
      if (!month || !year) {
        return res.status(400).json({ error: "Month and year are required" });
      }

      const selectedMonth = parseInt(month as string);
      const selectedYear = parseInt(year as string);

      // Calculate month boundaries
      const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
      const monthEnd = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);

      // Get client's payment configuration
      const clientProfiles = await storage.getAllClientProfiles();
      const profile = sessionUser.clientProfileId ? clientProfiles.find((p: any) => p.id === sessionUser.clientProfileId) : null;
      const paymentConfig = profile?.paymentConfiguration || sessionUser.paymentMethod || "pay_as_you_go";
      
      // Get all services and bundles for enrichment
      const allServices = await storage.getAllServices();
      const serviceMap = new Map(allServices.map((s: any) => [s.id, s]));
      const allBundles = await storage.getAllBundles();
      const bundleMap = new Map(allBundles.map((b: any) => [b.id, b]));
      const allPacks = await storage.getAllServicePacks();
      const packMap = new Map(allPacks.map((p: any) => [p.id, p]));
      
      // Get service requests
      const allServiceRequests = await storage.getServiceRequestsByUser(sessionUserId);
      let filteredServiceRequests: any[] = [];
      
      if (paymentConfig === "pay_as_you_go") {
        filteredServiceRequests = allServiceRequests.filter((sr: any) => {
          if (!sr.createdAt) return false;
          const createdDate = new Date(sr.createdAt);
          return createdDate >= monthStart && createdDate <= monthEnd && 
                 sr.finalPrice && parseFloat(sr.finalPrice) > 0;
        });
      } else {
        // Monthly payment or deduct from royalties - use deliveredAt
        filteredServiceRequests = allServiceRequests.filter((sr: any) => {
          if (!sr.deliveredAt) return false;
          const deliveredDate = new Date(sr.deliveredAt);
          return deliveredDate >= monthStart && deliveredDate <= monthEnd && 
                 sr.finalPrice && parseFloat(sr.finalPrice) > 0;
        });
      }
      
      // Enrich service requests
      const enrichedServiceRequests = filteredServiceRequests.map((sr: any) => {
        const service = serviceMap.get(sr.serviceId);
        return {
          id: sr.id,
          type: "ad_hoc",
          serviceName: service?.title || "Unknown Service",
          date: paymentConfig === "pay_as_you_go" ? sr.createdAt : sr.deliveredAt,
          status: sr.status,
          amount: parseFloat(sr.finalPrice || "0"),
        };
      });
      
      // Get bundle requests
      const allBundleRequests = await storage.getBundleRequestsByUser(sessionUserId);
      let filteredBundleRequests: any[] = [];
      
      if (paymentConfig === "pay_as_you_go") {
        filteredBundleRequests = allBundleRequests.filter((br: any) => {
          if (!br.createdAt) return false;
          const createdDate = new Date(br.createdAt);
          return createdDate >= monthStart && createdDate <= monthEnd && 
                 br.finalPrice && parseFloat(br.finalPrice) > 0;
        });
      } else {
        filteredBundleRequests = allBundleRequests.filter((br: any) => {
          if (!br.deliveredAt) return false;
          const deliveredDate = new Date(br.deliveredAt);
          return deliveredDate >= monthStart && deliveredDate <= monthEnd && 
                 br.finalPrice && parseFloat(br.finalPrice) > 0;
        });
      }
      
      // Enrich bundle requests
      const enrichedBundleRequests = filteredBundleRequests.map((br: any) => {
        const bundle = bundleMap.get(br.bundleId);
        return {
          id: br.id,
          type: "bundle",
          serviceName: bundle?.name || "Unknown Bundle",
          date: paymentConfig === "pay_as_you_go" ? br.createdAt : br.deliveredAt,
          status: br.status,
          amount: parseFloat(br.finalPrice || "0"),
        };
      });
      
      // Get pack subscriptions
      const allPackSubscriptions = await storage.getAllClientPackSubscriptions();
      const clientPackSubs = allPackSubscriptions.filter((ps: any) => {
        if (ps.userId !== sessionUserId && ps.clientProfileId !== sessionUser.clientProfileId) return false;
        if (!ps.startDate) return false;
        
        const startDate = new Date(ps.startDate);
        if (isNaN(startDate.getTime())) return false;
        const startedThisMonth = startDate >= monthStart && startDate <= monthEnd;
        
        let renewedThisMonth = false;
        if (ps.currentPeriodStart) {
          const periodStart = new Date(ps.currentPeriodStart);
          if (!isNaN(periodStart.getTime())) {
            renewedThisMonth = periodStart >= monthStart && periodStart <= monthEnd;
          }
        }
        
        return (startedThisMonth || renewedThisMonth) && ps.priceAtSubscription && parseFloat(ps.priceAtSubscription) > 0;
      });
      
      // Enrich pack subscriptions
      const enrichedPackSubs = clientPackSubs.map((ps: any) => {
        const pack = packMap.get(ps.packId);
        const isRenewal = ps.currentPeriodStart && new Date(ps.currentPeriodStart) >= monthStart;
        return {
          id: ps.id,
          type: "pack",
          serviceName: pack?.name || "Unknown Pack",
          date: isRenewal ? ps.currentPeriodStart : ps.startDate,
          status: ps.isActive ? "active" : "cancelled",
          amount: parseFloat(ps.priceAtSubscription || "0"),
          isRenewal,
        };
      });
      
      // Combine all items and calculate totals
      const allItems = [...enrichedServiceRequests, ...enrichedBundleRequests, ...enrichedPackSubs];
      allItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      const adHocTotal = enrichedServiceRequests.reduce((sum, item) => sum + item.amount, 0);
      const bundleTotal = enrichedBundleRequests.reduce((sum, item) => sum + item.amount, 0);
      const packTotal = enrichedPackSubs.reduce((sum, item) => sum + item.amount, 0);
      
      res.json({
        client: {
          id: sessionUser.id,
          name: sessionUser.username,
          email: sessionUser.email,
          paymentMethod: paymentConfig,
          companyName: profile?.companyName,
          billingAddress: profile?.billingAddress,
        },
        billingPeriod: {
          month: selectedMonth,
          year: selectedYear,
        },
        items: allItems,
        totals: {
          adHocCount: enrichedServiceRequests.length,
          adHocTotal,
          bundleCount: enrichedBundleRequests.length,
          bundleTotal,
          packCount: enrichedPackSubs.length,
          packTotal,
          grandTotal: adHocTotal + bundleTotal + packTotal,
        }
      });
    } catch (error) {
      console.error("Error fetching client invoice:", error);
      res.status(500).json({ error: "Failed to fetch invoice data" });
    }
  });

  // ==================== END CLIENT INVOICE VIEW ====================

  const httpServer = createServer(app);

  return httpServer;
}
