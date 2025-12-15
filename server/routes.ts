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
      const services = await storage.getAllServices();
      res.json(services);
    } catch (error) {
      console.error("Error fetching services:", error);
      res.status(500).json({ error: "Failed to fetch services", details: error instanceof Error ? error.message : String(error) });
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
      const service = await storage.createService(req.body);
      res.status(201).json(service);
    } catch (error) {
      res.status(500).json({ error: "Failed to create service" });
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

      console.log("Creating service request with data:", req.body);
      const requestData = {
        ...req.body,
        userId: sessionUserId, // Use session user instead of client-provided
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      };
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

  // Assign designer to request (designers can assign themselves or other designers)
  app.post("/api/service-requests/:id/assign", async (req, res) => {
    try {
      // Use session user for authorization
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Verify the session user is a designer
      const sessionUser = await storage.getUser(sessionUserId);
      if (!sessionUser) {
        return res.status(401).json({ error: "User not found" });
      }
      if (sessionUser.role !== "designer") {
        return res.status(403).json({ error: "Only designers can assign jobs" });
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

      // Verify target designer exists and is actually a designer
      const targetDesigner = await storage.getUser(targetDesignerId);
      if (!targetDesigner) {
        return res.status(404).json({ error: "Target designer not found" });
      }
      if (targetDesigner.role !== "designer") {
        return res.status(400).json({ error: "Can only assign to users with designer role" });
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
      // Use session user for authorization
      const sessionUserId = req.session.userId;
      if (!sessionUserId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      // Verify the user is a designer
      const user = await storage.getUser(sessionUserId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      if (user.role !== "designer") {
        return res.status(403).json({ error: "Only designers can deliver requests" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      if (existingRequest.status !== "in-progress" && existingRequest.status !== "change-request") {
        return res.status(400).json({ error: "Request must be in-progress or change-request to deliver" });
      }

      // Verify the user is the assignee
      if (existingRequest.assigneeId !== sessionUserId) {
        return res.status(403).json({ error: "Only the assigned designer can deliver this request" });
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

      // Verify the user exists and is a designer
      const user = await storage.getUser(sessionUserId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      if (user.role !== "designer") {
        return res.status(403).json({ error: "Only designers can resume work" });
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

      // For deliverable attachments: only the assigned designer can upload
      if (attachmentKind === "deliverable") {
        if (sessionUser.role !== "designer") {
          return res.status(403).json({ error: "Only designers can upload deliverables" });
        }
        if (existingRequest.assigneeId !== sessionUserId) {
          return res.status(403).json({ error: "Only the assigned designer can upload deliverables" });
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
      // If user already in session, return that user
      if (req.session.userId) {
        const existingUser = await storage.getUser(req.session.userId);
        if (existingUser) {
          return res.json({ userId: existingUser.id, role: existingUser.role, username: existingUser.username });
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
      
      res.json({ userId: user.id, role: user.role, username: user.username });
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

      const username = `${role}-user`;
      let user = await storage.getUserByUsername(username);
      
      if (!user) {
        user = await storage.createUser({
          username,
          password: "not-used",
          email: `${username}@example.com`,
          role,
        });
      }
      
      // Update session with new user
      req.session.userId = user.id;
      req.session.userRole = user.role;
      
      res.json({ userId: user.id, role: user.role, username: user.username });
    } catch (error) {
      console.error("Error switching role:", error);
      res.status(500).json({ error: "Failed to switch role" });
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

      for (const serviceData of servicesData) {
        console.log("Creating service:", serviceData.title);
        await storage.createService(serviceData);
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
    } catch (error) {
      console.error("Error creating user:", error);
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

      const updatedUser = await storage.updateUser(req.params.id, req.body);
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

      // Only admin can create vendor profiles
      if (sessionUser.role !== "admin") {
        return res.status(403).json({ error: "Only admins can create vendor profiles" });
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

  const httpServer = createServer(app);

  return httpServer;
}
