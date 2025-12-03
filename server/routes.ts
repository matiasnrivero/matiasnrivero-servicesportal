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

  // Service requests routes
  app.get("/api/service-requests", async (req, res) => {
    try {
      const { userId, assigneeId, status } = req.query;
      let requests;

      if (userId) {
        requests = await storage.getServiceRequestsByUser(userId as string);
      } else if (assigneeId) {
        requests = await storage.getServiceRequestsByAssignee(assigneeId as string);
      } else if (status) {
        requests = await storage.getServiceRequestsByStatus(status as string);
      } else {
        requests = await storage.getAllServiceRequests();
      }

      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch service requests" });
    }
  });

  app.get("/api/service-requests/:id", async (req, res) => {
    try {
      const request = await storage.getServiceRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Service request not found" });
      }
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch service request" });
    }
  });

  app.post("/api/service-requests", async (req, res) => {
    try {
      console.log("Creating service request with data:", req.body);
      const requestData = {
        ...req.body,
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      };
      const request = await storage.createServiceRequest(requestData);
      res.status(201).json(request);
    } catch (error) {
      console.error("Error creating service request:", error);
      res.status(500).json({ error: "Failed to create service request", details: error instanceof Error ? error.message : String(error) });
    }
  });

  app.patch("/api/service-requests/:id", async (req, res) => {
    try {
      const request = await storage.updateServiceRequest(req.params.id, req.body);
      if (!request) {
        return res.status(404).json({ error: "Service request not found" });
      }
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to update service request" });
    }
  });

  // Assign designer to request
  app.post("/api/service-requests/:id/assign", async (req, res) => {
    try {
      const { assigneeId } = req.body;
      if (!assigneeId) {
        return res.status(400).json({ error: "assigneeId is required" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      const request = await storage.assignDesigner(req.params.id, assigneeId);
      res.json(request);
    } catch (error) {
      console.error("Error assigning designer:", error);
      res.status(500).json({ error: "Failed to assign designer" });
    }
  });

  // Mark request as delivered
  app.post("/api/service-requests/:id/deliver", async (req, res) => {
    try {
      const { deliveredBy } = req.body;
      if (!deliveredBy) {
        return res.status(400).json({ error: "deliveredBy is required" });
      }

      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      if (existingRequest.status !== "in-progress" && existingRequest.status !== "change-request") {
        return res.status(400).json({ error: "Request must be in-progress or change-request to deliver" });
      }

      const request = await storage.deliverRequest(req.params.id, deliveredBy);
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

      const request = await storage.requestChange(req.params.id, changeNote);
      res.json(request);
    } catch (error) {
      console.error("Error requesting changes:", error);
      res.status(500).json({ error: "Failed to request changes" });
    }
  });

  // Resume work on request (after change request)
  app.post("/api/service-requests/:id/resume", async (req, res) => {
    try {
      const existingRequest = await storage.getServiceRequest(req.params.id);
      if (!existingRequest) {
        return res.status(404).json({ error: "Service request not found" });
      }

      if (existingRequest.status !== "change-request") {
        return res.status(400).json({ error: "Request must have change-request status to resume" });
      }

      const request = await storage.updateServiceRequest(req.params.id, { status: "in-progress" });
      res.json(request);
    } catch (error) {
      console.error("Error resuming request:", error);
      res.status(500).json({ error: "Failed to resume request" });
    }
  });

  // Attachments routes
  app.get("/api/service-requests/:requestId/attachments", async (req, res) => {
    try {
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
      const attachment = await storage.createAttachment({
        ...req.body,
        requestId: req.params.requestId,
      });
      res.status(201).json(attachment);
    } catch (error) {
      res.status(500).json({ error: "Failed to create attachment" });
    }
  });

  // Comments routes
  app.get("/api/service-requests/:requestId/comments", async (req, res) => {
    try {
      const { visibility } = req.query;
      const comments = await storage.getCommentsByRequest(
        req.params.requestId, 
        visibility as string | undefined
      );
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.post("/api/service-requests/:requestId/comments", async (req, res) => {
    try {
      const { authorId, body, visibility = "public", parentId } = req.body;
      
      if (!authorId || !body) {
        return res.status(400).json({ error: "authorId and body are required" });
      }

      const comment = await storage.createComment({
        requestId: req.params.requestId,
        authorId,
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

  // Get or create default user
  app.get("/api/default-user", async (req, res) => {
    try {
      let user = await storage.getUserByUsername("default-user");
      if (!user) {
        user = await storage.createUser({
          username: "default-user",
          password: "not-used",
          email: "default@example.com",
          role: "client",
        });
      }
      res.json({ userId: user.id, role: user.role, username: user.username });
    } catch (error) {
      console.error("Error getting default user:", error);
      res.status(500).json({ error: "Failed to get default user" });
    }
  });

  // Switch user role (for demo purposes)
  app.post("/api/switch-role", async (req, res) => {
    try {
      const { role } = req.body;
      if (!role || (role !== "client" && role !== "designer")) {
        return res.status(400).json({ error: "role must be 'client' or 'designer'" });
      }

      const username = role === "designer" ? "designer-user" : "default-user";
      let user = await storage.getUserByUsername(username);
      
      if (!user) {
        user = await storage.createUser({
          username,
          password: "not-used",
          email: `${username}@example.com`,
          role,
        });
      }
      
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
      if (existingServices.length > 0) {
        return res.json({ message: "Services already seeded" });
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
          decorationMethods: "All",
        },
        {
          title: "Creative Art",
          description: "Original artwork from just your idea, text, or inspiration.",
          basePrice: "20.00",
          priceRange: "$ 20 - $ 60",
          category: "creative",
          decorationMethods: "All",
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
          basePrice: "10.00",
          priceRange: "$ 10",
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

      // Create designer user for demo
      let designerUser = await storage.getUserByUsername("designer-user");
      if (!designerUser) {
        await storage.createUser({
          username: "designer-user",
          password: "not-used",
          email: "designer@example.com",
          role: "designer",
        });
      }

      console.log("Services seeded successfully");
      res.json({ message: "Services seeded successfully" });
    } catch (error) {
      console.error("Error seeding services:", error);
      res.status(500).json({ error: "Failed to seed services", details: error instanceof Error ? error.message : String(error) });
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
