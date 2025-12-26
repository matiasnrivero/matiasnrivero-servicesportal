import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

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
      // admin, internal_designer, vendor, vendor_designer can see all or assigned requests
      // client can only see their own requests
      if (sessionUser.role === "client") {
        // Clients can only see their own requests
        requests = await storage.getServiceRequestsByUser(sessionUserId);
      } else if (["admin", "internal_designer", "vendor", "vendor_designer", "designer"].includes(sessionUser.role)) {
        // Admin, Internal Designers, Vendors, Vendor Designers can see all requests
        if (status) {
          requests = await storage.getServiceRequestsByStatus(status as string);
        } else {
          requests = await storage.getAllServiceRequests();
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
      };

      // Only admin and internal_designer can set assigneeId during creation
      if (!["admin", "internal_designer"].includes(sessionUser.role)) {
        delete requestData.assigneeId;
      }

      const request = await storage.createServiceRequest(requestData);
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

  // Assign designer to request (admins, internal designers, vendors, vendor designers can assign)
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
      const canManageJobs = ["admin", "internal_designer", "vendor", "vendor_designer", "designer"].includes(sessionUser.role);
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

      // Get the target designer ID (from body or default to session user)
      const targetDesignerId = req.body.designerId || sessionUserId;

      // Verify target designer exists and can be assigned work
      const targetDesigner = await storage.getUser(targetDesignerId);
      if (!targetDesigner) {
        return res.status(404).json({ error: "Target designer not found" });
      }
      const canBeAssigned = ["admin", "internal_designer", "designer", "vendor_designer"].includes(targetDesigner.role);
      if (!canBeAssigned) {
        return res.status(400).json({ error: "Can only assign to admin, internal designers, designers, or vendor designers" });
      }

      // Assign the target designer
      const request = await storage.assignDesigner(req.params.id, targetDesignerId);
      res.json(request);
    } catch (error) {
      console.error("Error assigning designer:", error);
      res.status(500).json({ error: "Failed to assign designer" });
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
            phone: existingUser.phone
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
      
      res.json({ userId: user.id, role: user.role, username: user.username, email: user.email, phone: user.phone });
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
      
      // For client role, keep the same user but update their role
      // This allows users to see their own requests when switching to client view
      if (role === "client" && req.session.userId) {
        const currentUser = await storage.getUser(req.session.userId);
        if (currentUser) {
          // Update the current user's role to client
          user = await storage.updateUser(currentUser.id, { role: "client" });
        }
      }
      
      // For other roles, switch to the dedicated demo user
      if (!user) {
        // For vendor role, use Pixel's Hive vendor (Javier Rubiantes) for testing
        const username = role === "vendor" ? "Javier Rubiantes" : `${role}-user`;
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
      await storage.updateUser(user.id, { lastLoginAt: new Date() });
      
      // Prevent caching
      res.set('Cache-Control', 'no-store');
      res.json({ userId: user.id, role: user.role, username: user.username, email: user.email, phone: user.phone });
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

      res.json({ 
        userId: originalUser.id, 
        role: originalUser.role, 
        username: originalUser.username,
        impersonating: false 
      });
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
          title: "Vectorization & Color Separation",
          description: "Turn fuzzy images into sharp vectors, ready for screen printing.",
          basePrice: "10.00",
          priceRange: "$ 10",
          category: "production",
          decorationMethods: "Screen Printing",
        },
        {
          title: "Artwork Touch-Ups (DTF / DTG)",
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
      const canModify = () => {
        // Admin can modify anyone
        if (sessionUser.role === "admin") return true;
        // Vendor can modify vendors/vendor_designers under their structure
        if (sessionUser.role === "vendor") {
          const vendorStructureId = sessionUser.vendorId || sessionUserId;
          return targetUser.vendorId === vendorStructureId && 
                 ["vendor", "vendor_designer"].includes(targetUser.role);
        }
        return false;
      };

      if (!canModify()) {
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
      if (sessionUser.role === "client") {
        // Clients can only see their own requests
        requests = await storage.getBundleRequestsByUser(sessionUserId);
      } else if (["admin", "internal_designer", "vendor", "vendor_designer", "designer"].includes(sessionUser.role)) {
        // Admin, Internal Designers, Vendors, Vendor Designers can see all requests
        if (status) {
          requests = await storage.getBundleRequestsByStatus(status as string);
        } else {
          requests = await storage.getAllBundleRequests();
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

  // Assign designer to bundle request
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

      // Only admins, internal_designers, vendors, vendor_designers can assign
      if (!["admin", "internal_designer", "vendor", "vendor_designer"].includes(sessionUser.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const { assigneeId } = req.body;
      if (!assigneeId) {
        return res.status(400).json({ error: "assigneeId is required" });
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

      // Only the assigned designer, admin, or internal_designer can deliver
      const isAdmin = sessionUser.role === "admin";
      const isInternalDesigner = sessionUser.role === "internal_designer";
      const isAssignee = existingRequest.assigneeId === sessionUserId;

      if (!isAdmin && !isInternalDesigner && !isAssignee) {
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

  const httpServer = createServer(app);

  return httpServer;
}
