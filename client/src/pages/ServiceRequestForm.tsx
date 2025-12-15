import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import type { Service, InsertServiceRequest, Bundle, BundleItem, ServicePack, ServicePackItem } from "@shared/schema";
import { Header } from "@/components/Header";
import { FileUploader } from "@/components/FileUploader";
import { ChevronRight, HelpCircle, X, Boxes, CalendarRange, Package } from "lucide-react";

import complexityExample1 from "@assets/Imagen_de_WhatsApp_2025-09-04_a_las_11.08.18_29a99002_(1)_1765400666338.jpg";
import complexityExample2 from "@assets/Imagen_de_WhatsApp_2025-09-04_a_las_11.08.18_be732b8a_(2)_1765400666337.jpg";
import complexityExample3 from "@assets/Imagen_de_WhatsApp_2025-09-04_a_las_11.08.18_127a1c1b_(1)_1765400666337.jpg";
import complexityExample4 from "@assets/Imagen_de_WhatsApp_2025-09-04_a_las_11.08.19_caa9df90_(1)_1765400666335.jpg";

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
}

async function fetchServices(): Promise<Service[]> {
  const response = await fetch("/api/services");
  if (!response.ok) {
    throw new Error("Failed to fetch services");
  }
  return response.json();
}

async function getDefaultUser(): Promise<CurrentUser> {
  const response = await fetch("/api/default-user");
  if (!response.ok) {
    throw new Error("Failed to get default user");
  }
  return response.json();
}

async function createServiceRequest(data: InsertServiceRequest) {
  const response = await fetch("/api/service-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to create service request");
  }
  return response.json();
}

const SERVICE_ORDER = [
  "Vectorization & Color Separation",
  "Artwork Touch-Ups (DTF / DTG)",
  "Embroidery Digitization",
  "Creative Art",
  "Artwork Composition",
  "Dye-Sublimation Template",
  "Store Creation",
  "Store Banner Design",
  "Flyer Design",
  "Blank Product - PSD",
];

function sortServices(services: Service[]): Service[] {
  return [...services].sort((a, b) => {
    const indexA = SERVICE_ORDER.indexOf(a.title);
    const indexB = SERVICE_ORDER.indexOf(b.title);
    const orderA = indexA === -1 ? 999 : indexA;
    const orderB = indexB === -1 ? 999 : indexB;
    return orderA - orderB;
  });
}

const vectorizationOutputFormats = [
  { value: "AI", label: "AI - Adobe Illustrator" },
  { value: "EPS", label: "EPS - Encapsulated PostScript" },
  { value: "PDF", label: "PDF - Portable Document Format" },
  { value: "SVG", label: "SVG - Scalable Vector Graphics" },
];

const vectorizationColorModes = [
  { value: "CMYK", label: "CMYK" },
  { value: "Pantone", label: "Pantone" },
  { value: "RGB", label: "RGB" },
];

const dtfDtgOutputFormats = [
  { value: "PSD", label: "PSD - Photoshop Document" },
  { value: "PNG", label: "PNG - Portable Network Graphic" },
  { value: "TIF", label: "TIF - Tagged Image Format" },
];

const dtfDtgColorModes = [
  { value: "CMYK", label: "CMYK" },
  { value: "RGB", label: "RGB" },
];

const compositionOutputFormats = [
  { value: "AI", label: "AI - Adobe Illustrator" },
  { value: "PDF", label: "PDF - Portable Document Format" },
  { value: "PNG", label: "PNG - Portable Network Graphic" },
];

const creativeArtOutputFormats = [
  { value: "AI", label: "AI - Adobe Illustrator" },
  { value: "PDF", label: "PDF - Portable Document Format" },
  { value: "PNG", label: "PNG - Portable Network Graphic" },
];

const creativeArtComplexity = [
  { value: "Basic", label: "Basic - $40", price: 40 },
  { value: "Standard", label: "Standard - $60", price: 60 },
  { value: "Advanced", label: "Advanced - $80", price: 80 },
  { value: "Ultimate", label: "Ultimate - $100", price: 100 },
];

const embroideryOutputFormats = [
  { value: "DST", label: "DST" },
  { value: "EMB", label: "EMB" },
  { value: "PES", label: "PES" },
  { value: "JEF", label: "JEF" },
  { value: "PDF", label: "PDF" },
  { value: "Other", label: "Other (specify in notes)" },
];

const embroideryThreadColors = [
  { value: "PMS", label: "PMS" },
  { value: "ThreadChart", label: "Thread Chart #s" },
];

const dyeSubOutputFormats = [
  { value: "PSD_Layered", label: "PSD Layered - Adobe Photoshop File with Layers" },
  { value: "AI", label: "AI - Adobe Illustrator" },
  { value: "PNG", label: "PNG - Portable Network Graphic" },
];

const dyeSubColorModes = [
  { value: "CMYK", label: "CMYK" },
  { value: "RGB", label: "RGB" },
];

const flyerOutputFormats = [
  { value: "AI", label: "AI - Adobe Illustrator" },
  { value: "PDF", label: "PDF - Portable Document Format" },
];

const flyerColorModes = [
  { value: "CMYK", label: "CMYK" },
  { value: "RGB", label: "RGB" },
];

const fabricTypeOptions = ["Cotton", "Polyester", "Blend", "Denim", "Leather", "Nylon"];
const garmentSizeOptions = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "Youth", "Custom"];
const bleedMarginOptions = ["0.125 inches", "0.25 inches", "0.5 inches", "None"];
const orientationOptions = ["Horizontal", "Vertical"];
const supplierOptions = ["SanMar", "S&S Activewear", "alphabroder", "Augusta Sportswear", "Other"];

const storeCreationPricing = [
  { minProducts: 1, maxProducts: 50, pricePerItem: 1.50 },
  { minProducts: 51, maxProducts: 75, pricePerItem: 1.30 },
  { minProducts: 76, maxProducts: 100, pricePerItem: 1.10 },
  { minProducts: 101, maxProducts: 999999, pricePerItem: 1.00 },
];

function calculateStoreCreationPrice(productCount: number): number {
  if (!productCount || productCount <= 0) return 0;
  const tier = storeCreationPricing.find(
    (t) => productCount >= t.minProducts && productCount <= t.maxProducts
  );
  return tier ? Number((productCount * tier.pricePerItem).toFixed(2)) : 0;
}

export default function ServiceRequestForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [complexityHelpModalOpen, setComplexityHelpModalOpen] = useState(false);
  const [threadColorInput, setThreadColorInput] = useState("");
  const [threadColorChips, setThreadColorChips] = useState<string[]>([]);
  
  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ["services"],
    queryFn: fetchServices,
  });

  const { data: bundles = [] } = useQuery<Bundle[]>({
    queryKey: ["/api/bundles"],
  });

  const { data: servicePacks = [] } = useQuery<ServicePack[]>({
    queryKey: ["/api/service-packs"],
  });

  const { data: currentUser } = useQuery({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const urlParams = new URLSearchParams(window.location.search);
  const preSelectedServiceId = urlParams.get("serviceId") || "";

  const [selectedServiceId, setSelectedServiceId] = useState<string>(preSelectedServiceId);
  const [selectedBundleId, setSelectedBundleId] = useState<string>("");
  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [selectionMode, setSelectionMode] = useState<"adhoc" | "bundle" | "pack">("adhoc");
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, Array<{ url: string; name: string }>>>({});
  const [calculatedPrice, setCalculatedPrice] = useState<number>(0);
  
  const { register, handleSubmit, reset, setValue, watch } = useForm();

  useEffect(() => {
    if (preSelectedServiceId && services.length > 0) {
      setSelectedServiceId(preSelectedServiceId);
    }
  }, [preSelectedServiceId, services]);

  useEffect(() => {
    if (currentUser?.username) {
      setValue("customerName", currentUser.username);
    }
  }, [currentUser, setValue]);

  const prevServiceIdRef = useRef<string>("");
  useEffect(() => {
    if (prevServiceIdRef.current && prevServiceIdRef.current !== selectedServiceId) {
      setThreadColorInput("");
      setThreadColorChips([]);
      setFormData(prev => ({ ...prev, threadColors: [] }));
    }
    prevServiceIdRef.current = selectedServiceId;
  }, [selectedServiceId]);

  useEffect(() => {
    if (formData.amountOfProducts) {
      const price = calculateStoreCreationPrice(parseInt(formData.amountOfProducts));
      setCalculatedPrice(price);
    }
  }, [formData.amountOfProducts]);

  const selectedService = services.find((s) => s.id === selectedServiceId);
  // Pricing visible only for Clients and Admins
  const showPricing = currentUser && (currentUser.role === "client" || currentUser.role === "admin");

  useEffect(() => {
    if (selectedService?.title === "Embroidery Digitization") {
      const basePrice = parseFloat(selectedService.basePrice) || 15;
      const vectorizationAddOn = formData.vectorizationNeeded ? 5 : 0;
      setCalculatedPrice(basePrice + vectorizationAddOn);
    }
  }, [formData.vectorizationNeeded, selectedService]);

  const mutation = useMutation({
    mutationFn: createServiceRequest,
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Service request created successfully",
      });
      reset();
      setSelectedServiceId("");
      setFormData({});
      setUploadedFiles({});
      setCalculatedPrice(0);
      setThreadColorInput("");
      setThreadColorChips([]);
      queryClient.invalidateQueries({ queryKey: ["/api/service-requests"] });
      navigate("/service-requests");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create service request",
        variant: "destructive",
      });
    },
  });

  const handleFormDataChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEmbroideryFormatToggle = (format: string) => {
    const current = formData.outputFormats || [];
    const updated = current.includes(format)
      ? current.filter((f: string) => f !== format)
      : [...current, format];
    handleFormDataChange("outputFormats", updated);
  };

  const handleFileUpload = (fieldName: string, url: string, name: string) => {
    setUploadedFiles(prev => ({
      ...prev,
      [fieldName]: [...(prev[fieldName] || []), { url, name }]
    }));
  };

  const handleFileRemove = (fieldName: string, fileName: string) => {
    setUploadedFiles(prev => ({
      ...prev,
      [fieldName]: (prev[fieldName] || []).filter((f: { name: string }) => f.name !== fileName)
    }));
  };

  const handleAddThreadColor = (color: string) => {
    const trimmed = color.trim();
    if (trimmed && !threadColorChips.includes(trimmed)) {
      const newChips = [...threadColorChips, trimmed];
      setThreadColorChips(newChips);
      handleFormDataChange("threadColors", newChips);
    }
    setThreadColorInput("");
  };

  const handleRemoveThreadColor = (color: string) => {
    const newChips = threadColorChips.filter(c => c !== color);
    setThreadColorChips(newChips);
    handleFormDataChange("threadColors", newChips);
  };

  const handleThreadColorKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleAddThreadColor(threadColorInput);
    }
  };

  const onSubmit = async (data: any) => {
    try {
      const allFormData = {
        ...formData,
        uploadedFiles,
        calculatedPrice: calculatedPrice > 0 ? calculatedPrice : undefined,
      };

      mutation.mutate({
        userId: currentUser?.userId || "",
        serviceId: selectedServiceId,
        status: "pending",
        orderNumber: data.orderNumber || null,
        customerName: currentUser?.username || data.customerName,
        notes: data.jobNotes,
        requirements: data.requirements,
        quantity: data.quantity ? parseInt(data.quantity) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        formData: allFormData,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit request",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    navigate("/service-requests");
  };

  const handleBack = () => {
    setSelectedServiceId("");
    setSelectedBundleId("");
    setSelectedPackId("");
    setFormData({});
    setUploadedFiles({});
    setCalculatedPrice(0);
    setThreadColorInput("");
    setThreadColorChips([]);
    reset();
  };

  const activeBundles = bundles.filter((b: Bundle) => b.isActive);
  const activePacks = servicePacks.filter((p: ServicePack) => p.isActive);

  const renderServiceSelector = () => (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8">
      <h1 className="font-title-semibold text-dark-blue-night text-3xl mb-2">
        Create Service Request
      </h1>
      <p className="text-dark-gray mb-8 text-center max-w-xl">
        Select the type of service you need. Each service has specific requirements to help us deliver the best results.
      </p>
      
      <div className="w-full max-w-4xl">
        <Tabs defaultValue="adhoc" onValueChange={(v) => {
          setSelectionMode(v as "adhoc" | "bundle" | "pack");
          setSelectedServiceId("");
          setSelectedBundleId("");
          setSelectedPackId("");
        }}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="adhoc" data-testid="tab-adhoc" className="gap-2">
              <Package className="h-4 w-4" />
              Ad-hoc Services
            </TabsTrigger>
            <TabsTrigger value="bundle" data-testid="tab-bundles" className="gap-2">
              <Boxes className="h-4 w-4" />
              Bundles
            </TabsTrigger>
            <TabsTrigger value="pack" data-testid="tab-packs" className="gap-2">
              <CalendarRange className="h-4 w-4" />
              Monthly Packs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="adhoc">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortServices(services).map((service) => (
                <Card
                  key={service.id}
                  className={`cursor-pointer transition-all hover-elevate border-2 ${
                    selectedServiceId === service.id 
                      ? "border-sky-blue-accent bg-blue-lavender/30" 
                      : "border-transparent"
                  }`}
                  onClick={() => setSelectedServiceId(service.id)}
                  data-testid={`card-service-${service.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <h3 className="font-body-2-semibold text-dark-blue-night">
                          {service.title}
                        </h3>
                        <p className="font-body-3-reg text-dark-gray mt-1 line-clamp-2">
                          {service.description}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {showPricing && (
                          <span className="text-sky-blue-accent font-body-2-semibold">
                            {service.priceRange}
                          </span>
                        )}
                        <ChevronRight className="h-5 w-5 text-dark-gray" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="bundle">
            {activeBundles.length === 0 ? (
              <div className="text-center py-12 text-dark-gray">
                <Boxes className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No bundles available at this time.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeBundles.map((bundle: Bundle) => (
                  <Card
                    key={bundle.id}
                    className={`cursor-pointer transition-all hover-elevate border-2 ${
                      selectedBundleId === bundle.id 
                        ? "border-sky-blue-accent bg-blue-lavender/30" 
                        : "border-transparent"
                    }`}
                    onClick={() => setSelectedBundleId(bundle.id)}
                    data-testid={`card-bundle-${bundle.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-body-2-semibold text-dark-blue-night">
                              {bundle.name}
                            </h3>
                            {bundle.discountPercentage && parseFloat(bundle.discountPercentage) > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {bundle.discountPercentage}% off
                              </Badge>
                            )}
                          </div>
                          {bundle.description && (
                            <p className="font-body-3-reg text-dark-gray mt-1 line-clamp-2">
                              {bundle.description}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {showPricing && bundle.finalPrice && (
                            <span className="text-sky-blue-accent font-body-2-semibold">
                              ${parseFloat(bundle.finalPrice).toFixed(2)}
                            </span>
                          )}
                          <ChevronRight className="h-5 w-5 text-dark-gray" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pack">
            {activePacks.length === 0 ? (
              <div className="text-center py-12 text-dark-gray">
                <CalendarRange className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No monthly packs available at this time.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activePacks.map((pack: ServicePack) => (
                  <Card
                    key={pack.id}
                    className={`cursor-pointer transition-all hover-elevate border-2 ${
                      selectedPackId === pack.id 
                        ? "border-sky-blue-accent bg-blue-lavender/30" 
                        : "border-transparent"
                    }`}
                    onClick={() => setSelectedPackId(pack.id)}
                    data-testid={`card-pack-${pack.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="font-body-2-semibold text-dark-blue-night">
                            {pack.name}
                          </h3>
                          {pack.description && (
                            <p className="font-body-3-reg text-dark-gray mt-1 line-clamp-2">
                              {pack.description}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {showPricing && pack.monthlyPrice && (
                            <span className="text-sky-blue-accent font-body-2-semibold">
                              ${parseFloat(pack.monthlyPrice).toFixed(2)}/mo
                            </span>
                          )}
                          <ChevronRight className="h-5 w-5 text-dark-gray" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );

  const renderPricingModal = () => (
    <Dialog open={pricingModalOpen} onOpenChange={setPricingModalOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-dark-blue-night">
            Pricing table
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-dark-blue-night mb-6">
            Depending on the amount of products entered by the user the final pricing will vary as follows:
          </p>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 text-dark-gray font-normal">Quantity of products</th>
                <th className="text-left py-3 text-dark-gray font-normal">$ per item</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-4 text-dark-blue-night">1-50</td>
                <td className="py-4 text-dark-blue-night">$ 1.50</td>
              </tr>
              <tr className="border-b">
                <td className="py-4 text-dark-blue-night">51-75</td>
                <td className="py-4 text-dark-blue-night">$ 1.30</td>
              </tr>
              <tr className="border-b">
                <td className="py-4 text-dark-blue-night">76-100</td>
                <td className="py-4 text-dark-blue-night">$ 1.10</td>
              </tr>
              <tr>
                <td className="py-4 text-dark-blue-night">&gt; 101</td>
                <td className="py-4 text-dark-blue-night">$ 1.00</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <Button 
            onClick={() => setPricingModalOpen(false)}
            className="bg-sky-blue-accent hover:bg-sky-blue-accent/90 text-white"
            data-testid="button-got-it"
          >
            Got It
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const complexityExamples = [
    { image: complexityExample1, title: "Central Cheer" },
    { image: complexityExample2, title: "United We Stand" },
    { image: complexityExample3, title: "NFR Ranch" },
    { image: complexityExample4, title: "I May Get Lost" },
  ];

  const complexityLabels = ["Basic", "Standard", "Advanced", "Ultimate"];

  const renderComplexityHelpModal = () => (
    <Dialog open={complexityHelpModalOpen} onOpenChange={setComplexityHelpModalOpen}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle className="text-xl font-semibold text-dark-blue-night">
            Artwork Complexities Help
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-dark-blue-night mb-6">
            Here is an example so you can see the difference between our levels:
          </p>
          <div className="space-y-8">
            {complexityExamples.map((example, index) => (
              <div key={index} className="space-y-3">
                <img 
                  src={example.image} 
                  alt={`${example.title} complexity examples`}
                  className="w-full rounded-lg"
                  data-testid={`img-complexity-example-${index}`}
                />
                <div className="grid grid-cols-4 gap-4">
                  {complexityLabels.map((label, labelIndex) => (
                    <span 
                      key={labelIndex} 
                      className="text-center text-dark-blue-night font-medium"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end pt-4">
          <Button 
            onClick={() => setComplexityHelpModalOpen(false)}
            className="bg-sky-blue-accent hover:bg-sky-blue-accent/90 text-white"
            data-testid="button-complexity-got-it"
          >
            Got It
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  const renderDynamicFormFields = () => {
    if (!selectedService) return null;

    const title = selectedService.title;

    if (title === "Vectorization & Color Separation") {
      return (
        <>
          <div className="space-y-2">
            <Label>Upload Artwork File<span className="text-destructive">*</span></Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("artworkFile", url, name)}
              onFileRemove={(fileName) => handleFileRemove("artworkFile", fileName)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Desired Output Format<span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => handleFormDataChange("outputFormat", v)}>
                <SelectTrigger data-testid="select-output-format">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {vectorizationOutputFormats.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color Mode<span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => handleFormDataChange("colorMode", v)}>
                <SelectTrigger data-testid="select-color-mode">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {vectorizationColorModes.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Number of Colors</Label>
            <Input
              type="number"
              placeholder="0"
              onChange={(e) => handleFormDataChange("numberOfColors", e.target.value)}
              data-testid="input-number-of-colors"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Width in Inches</Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("widthInches", e.target.value)}
                data-testid="input-width-inches"
              />
            </div>
            <div className="space-y-2">
              <Label>Height in inches</Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("heightInches", e.target.value)}
                data-testid="input-height-inches"
              />
            </div>
          </div>
        </>
      );
    }

    if (title === "Artwork Touch-Ups (DTF / DTG)") {
      return (
        <>
          <div className="space-y-2">
            <Label>Upload Artwork File<span className="text-destructive">*</span></Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("artworkFile", url, name)}
              onFileRemove={(fileName) => handleFileRemove("artworkFile", fileName)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Desired Output Format<span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => handleFormDataChange("outputFormat", v)}>
                <SelectTrigger data-testid="select-output-format">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {dtfDtgOutputFormats.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color Mode<span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => handleFormDataChange("colorMode", v)}>
                <SelectTrigger data-testid="select-color-mode">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {dtfDtgColorModes.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Width in inches</Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("widthInches", e.target.value)}
                data-testid="input-width-inches"
              />
            </div>
            <div className="space-y-2">
              <Label>Height in inches</Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("heightInches", e.target.value)}
                data-testid="input-height-inches"
              />
            </div>
          </div>
        </>
      );
    }

    if (title === "Artwork Composition") {
      return (
        <>
          <div className="space-y-2">
            <Label>Brand Guidelines</Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("brandGuidelines", url, name)}
              onFileRemove={(fileName) => handleFileRemove("brandGuidelines", fileName)}
            />
          </div>
          <div className="space-y-2">
            <Label>Upload Assets<span className="text-destructive">*</span></Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("uploadAssets", url, name)}
              onFileRemove={(fileName) => handleFileRemove("uploadAssets", fileName)}
            />
          </div>
          <div className="space-y-2">
            <Label>Desired Output Format<span className="text-destructive">*</span></Label>
            <Select onValueChange={(v) => handleFormDataChange("outputFormat", v)}>
              <SelectTrigger data-testid="select-output-format">
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {compositionOutputFormats.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Width in inches</Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("widthInches", e.target.value)}
                data-testid="input-width-inches"
              />
            </div>
            <div className="space-y-2">
              <Label>Height in inches</Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("heightInches", e.target.value)}
                data-testid="input-height-inches"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Text Content to Include in Artwork</Label>
            <Input
              placeholder="Please enter the text to include in the Artwork"
              onChange={(e) => handleFormDataChange("textContent", e.target.value)}
              data-testid="input-text-content"
            />
          </div>
          <div className="space-y-2">
            <Label>Example / Inspiration</Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("inspirationFile", url, name)}
              onFileRemove={(fileName) => handleFileRemove("inspirationFile", fileName)}
            />
          </div>
        </>
      );
    }

    if (title === "Creative Art") {
      return (
        <>
          <div className="space-y-2">
            <Label>Brand Guidelines</Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("brandGuidelines", url, name)}
              onFileRemove={(fileName) => handleFileRemove("brandGuidelines", fileName)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Desired Output Format<span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => handleFormDataChange("outputFormat", v)}>
                <SelectTrigger data-testid="select-output-format">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {creativeArtOutputFormats.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Select Complexity<span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => handleFormDataChange("complexity", v)}>
                <SelectTrigger data-testid="select-complexity">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {creativeArtComplexity.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {showPricing ? opt.label : opt.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button 
                type="button"
                className="text-sky-blue-accent text-sm hover:underline"
                onClick={() => setComplexityHelpModalOpen(true)}
                data-testid="button-complexity-help"
              >
                Artwork Complexities Help
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Width in Pixels<span className="text-destructive">*</span></Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("widthPixels", e.target.value)}
                data-testid="input-width-pixels"
              />
            </div>
            <div className="space-y-2">
              <Label>Height in Pixels<span className="text-destructive">*</span></Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("heightPixels", e.target.value)}
                data-testid="input-height-pixels"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Text Content to Include in Artwork</Label>
            <Input
              placeholder="Please enter the text to include in the Artwork"
              onChange={(e) => handleFormDataChange("textContent", e.target.value)}
              data-testid="input-text-content"
            />
          </div>
          <div className="space-y-2">
            <Label>Example / Inspiration</Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("inspirationFile", url, name)}
              onFileRemove={(fileName) => handleFileRemove("inspirationFile", fileName)}
            />
          </div>
          <div className="space-y-2">
            <Label>Project Brief<span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="Please tell us about your ideas for this project"
              onChange={(e) => handleFormDataChange("projectBrief", e.target.value)}
              rows={3}
              data-testid="textarea-project-brief"
            />
          </div>
          {renderComplexityHelpModal()}
        </>
      );
    }

    if (title === "Embroidery Digitization") {
      return (
        <>
          <div className="space-y-2">
            <Label>Upload Artwork File<span className="text-destructive">*</span></Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("artworkFile", url, name)}
              onFileRemove={(fileName) => handleFileRemove("artworkFile", fileName)}
            />
          </div>
          <div className="space-y-2">
            <Label>Desired Output Format(s)<span className="text-destructive">*</span></Label>
            <div className="border rounded-md p-3 space-y-2 bg-white dark:bg-background">
              {embroideryOutputFormats.map(opt => (
                <div key={opt.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`format-${opt.value}`}
                    checked={(formData.outputFormats || []).includes(opt.value)}
                    onCheckedChange={() => handleEmbroideryFormatToggle(opt.value)}
                    data-testid={`checkbox-format-${opt.value}`}
                  />
                  <Label htmlFor={`format-${opt.value}`} className="font-normal cursor-pointer">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Width in inches<span className="text-destructive">*</span></Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("widthInches", e.target.value)}
                data-testid="input-width-inches"
              />
            </div>
            <div className="space-y-2">
              <Label>Height in inches<span className="text-destructive">*</span></Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("heightInches", e.target.value)}
                data-testid="input-height-inches"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fabric Type</Label>
              <Select onValueChange={(v) => handleFormDataChange("fabricType", v)}>
                <SelectTrigger data-testid="select-fabric-type">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {fabricTypeOptions.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Thread Colors</Label>
              <div className="space-y-2">
                <Input
                  placeholder="Type a color and press Enter or Space to add"
                  value={threadColorInput}
                  onChange={(e) => setThreadColorInput(e.target.value)}
                  onKeyDown={handleThreadColorKeyDown}
                  data-testid="input-thread-colors"
                />
                {threadColorChips.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {threadColorChips.map((color, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-lavender text-dark-blue-night rounded-md text-sm"
                        data-testid={`chip-thread-color-${index}`}
                      >
                        {color}
                        <button
                          type="button"
                          onClick={() => handleRemoveThreadColor(color)}
                          className="hover:text-destructive"
                          data-testid={`button-remove-thread-color-${index}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="vectorizationNeeded"
              onCheckedChange={(checked) => handleFormDataChange("vectorizationNeeded", checked)}
              data-testid="checkbox-vectorization-needed"
            />
            <Label htmlFor="vectorizationNeeded" className="flex items-center gap-1">
              Vectorization Needed
              {showPricing && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-dark-gray cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-dark-blue-night text-white max-w-[200px]">
                    <p>By Requiring Vectorization $5 are gonna be added to the final price.</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </Label>
          </div>
          {showPricing && calculatedPrice > 0 && (
            <div className="p-3 bg-blue-lavender/30 rounded-md">
              <p className="text-sm font-semibold text-dark-blue-night">
                Service Price: ${calculatedPrice}
                {formData.vectorizationNeeded && (
                  <span className="font-normal text-dark-gray ml-2">
                    ($15 base + $5 vectorization)
                  </span>
                )}
              </p>
            </div>
          )}
        </>
      );
    }

    if (title === "Dye-Sublimation Template") {
      return (
        <>
          <div className="space-y-2">
            <Label>Upload Artwork File<span className="text-destructive">*</span></Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("artworkFile", url, name)}
              onFileRemove={(fileName) => handleFileRemove("artworkFile", fileName)}
            />
          </div>
          <div className="space-y-2">
            <Label>Garment or Product Template by Size<span className="text-destructive">*</span></Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("garmentTemplates", url, name)}
              onFileRemove={(fileName) => handleFileRemove("garmentTemplates", fileName)}
              acceptedTypes=".pdf,.psd,.ai"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Bleed Margins</Label>
              <Select onValueChange={(v) => handleFormDataChange("bleedMargins", v)}>
                <SelectTrigger data-testid="select-bleed-margins">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {bleedMarginOptions.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Color Mode<span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => handleFormDataChange("colorMode", v)}>
                <SelectTrigger data-testid="select-color-mode">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {dyeSubColorModes.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Output Format<span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => handleFormDataChange("outputFormat", v)}>
                <SelectTrigger data-testid="select-output-format">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {dyeSubOutputFormats.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Mockup / Wrap Sample</Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("mockupSample", url, name)}
              onFileRemove={(fileName) => handleFileRemove("mockupSample", fileName)}
            />
          </div>
          <div className="space-y-2">
            <Label>Project Brief</Label>
            <Input
              placeholder="Please tell us about your ideas for this project"
              onChange={(e) => handleFormDataChange("projectBrief", e.target.value)}
              data-testid="input-project-brief"
            />
          </div>
        </>
      );
    }

    if (title === "Store Banner Design") {
      return (
        <>
          <div className="space-y-2">
            <Label>Upload Assets<span className="text-destructive">*</span></Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("uploadAssets", url, name)}
              onFileRemove={(fileName) => handleFileRemove("uploadAssets", fileName)}
            />
          </div>
          <div className="space-y-2">
            <Label>Text Content to Include in Artwork</Label>
            <Input
              placeholder="Please enter the text to include in the Artwork"
              onChange={(e) => handleFormDataChange("textContent", e.target.value)}
              data-testid="input-text-content"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Width in inches<span className="text-destructive">*</span></Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("widthInches", e.target.value)}
                data-testid="input-width-inches"
              />
            </div>
            <div className="space-y-2">
              <Label>Height in inches<span className="text-destructive">*</span></Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("heightInches", e.target.value)}
                data-testid="input-height-inches"
              />
            </div>
          </div>
        </>
      );
    }

    if (title === "Flyer Design") {
      return (
        <>
          <div className="space-y-2">
            <Label>Upload Assets<span className="text-destructive">*</span></Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("uploadAssets", url, name)}
              onFileRemove={(fileName) => handleFileRemove("uploadAssets", fileName)}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Desired Output Format<span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => handleFormDataChange("outputFormat", v)}>
                <SelectTrigger data-testid="select-output-format">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {flyerOutputFormats.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color Mode<span className="text-destructive">*</span></Label>
              <Select onValueChange={(v) => handleFormDataChange("colorMode", v)}>
                <SelectTrigger data-testid="select-color-mode">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {flyerColorModes.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Flyer Orientation<span className="text-destructive">*</span></Label>
            <Select onValueChange={(v) => handleFormDataChange("flyerOrientation", v)}>
              <SelectTrigger data-testid="select-flyer-orientation">
                <SelectValue placeholder="Select an option" />
              </SelectTrigger>
              <SelectContent>
                {orientationOptions.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Width in Inches<span className="text-destructive">*</span></Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("widthInches", e.target.value)}
                data-testid="input-width-inches"
              />
            </div>
            <div className="space-y-2">
              <Label>Height in Inches<span className="text-destructive">*</span></Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("heightInches", e.target.value)}
                data-testid="input-height-inches"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Text Content to Include in Artwork</Label>
            <Input
              placeholder="Please enter the text to include in the Artwork"
              onChange={(e) => handleFormDataChange("textContent", e.target.value)}
              data-testid="input-text-content"
            />
          </div>
          <div className="space-y-2">
            <Label>Upload QR Code</Label>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("qrCode", url, name)}
              onFileRemove={(fileName) => handleFileRemove("qrCode", fileName)}
            />
          </div>
        </>
      );
    }

    if (title === "Store Creation") {
      return (
        <>
          {showPricing && renderPricingModal()}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Store Name/Store URL<span className="text-destructive">*</span></Label>
              <Input
                placeholder="Add a Store Name or Store URL"
                onChange={(e) => handleFormDataChange("storeName", e.target.value)}
                data-testid="input-store-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Amount of Products<span className="text-destructive">*</span></Label>
              <Input
                type="number"
                placeholder="0"
                onChange={(e) => handleFormDataChange("amountOfProducts", e.target.value)}
                data-testid="input-amount-products"
              />
              {showPricing && calculatedPrice > 0 && (
                <p className="text-sm text-sky-blue-accent font-semibold">
                  Calculated Price: ${calculatedPrice}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Upload Assets<span className="text-destructive">*</span></Label>
            <p className="text-sm text-dark-gray">Logos, designs, etc.</p>
            <FileUploader
              onUploadComplete={(url, name) => handleFileUpload("uploadAssets", url, name)}
              onFileRemove={(fileName) => handleFileRemove("uploadAssets", fileName)}
            />
          </div>
          <div className="space-y-2">
            <Label>Product Assortment Description</Label>
            <Input
              placeholder="Please tell us about the brand or if you have a product assortment in mind"
              onChange={(e) => handleFormDataChange("productAssortment", e.target.value)}
              data-testid="input-product-assortment"
            />
          </div>
        </>
      );
    }

    if (title === "Blank Product - PSD") {
      return (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Blank Name</Label>
              <Input
                placeholder="Blank Name"
                onChange={(e) => handleFormDataChange("blankName", e.target.value)}
                data-testid="input-blank-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Select onValueChange={(v) => handleFormDataChange("supplier", v)}>
                <SelectTrigger data-testid="select-supplier">
                  <SelectValue placeholder="Supplier" />
                </SelectTrigger>
                <SelectContent>
                  {supplierOptions.map(opt => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Blank URL<span className="text-destructive">*</span></Label>
            <Input
              placeholder="Add the blank URL"
              onChange={(e) => handleFormDataChange("blankUrl", e.target.value)}
              data-testid="input-blank-url"
            />
          </div>
        </>
      );
    }

    return null;
  };

  const renderServiceForm = () => (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-title-semibold text-dark-blue-night text-2xl flex items-center gap-3">
              {selectedService?.title}
              {showPricing && (
                selectedService?.title === "Store Creation" ? (
                  <button
                    type="button"
                    onClick={() => setPricingModalOpen(true)}
                    className="text-sky-blue-accent text-sm underline hover:text-sky-blue-accent/80"
                    data-testid="link-pricing-breakdown"
                  >
                    Pricing Breakdown
                  </button>
                ) : (
                  <span className="text-sky-blue-accent font-body-2-semibold">
                    {selectedService?.priceRange}
                  </span>
                )
              )}
            </h1>
            <p className="font-body-reg text-dark-gray mt-1">
              {selectedService?.description}
            </p>
          </div>
          <Button type="button" onClick={handleSubmit(onSubmit)} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <h3 className="font-body-2-semibold text-dark-blue-night">General Info</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="orderNumber">Order/Project Reference</Label>
                  <Input
                    id="orderNumber"
                    {...register("orderNumber")}
                    placeholder="Add an order or project reference (optional)"
                    data-testid="input-order-reference"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    lang="en-US"
                    min={(() => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      return tomorrow.toLocaleDateString('en-CA');
                    })()}
                    {...register("dueDate")}
                    data-testid="input-due-date"
                  />
                </div>
              </div>

              <h3 className="font-body-2-semibold text-dark-blue-night pt-4">Info Details</h3>
              
              {renderDynamicFormFields()}

              <div className="space-y-2">
                <Label htmlFor="jobNotes">Job Notes</Label>
                <Textarea
                  id="jobNotes"
                  {...register("jobNotes")}
                  placeholder="Please leave your comments here"
                  rows={3}
                  data-testid="textarea-job-notes"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button 
                  type="button" 
                  variant="outline"
                  className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
                  onClick={handleCancel}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    data-testid="button-back"
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    disabled={mutation.isPending}
                    data-testid="button-save"
                  >
                    {mutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );

  if (servicesLoading) {
    return (
      <main className="flex flex-col w-full min-h-screen bg-light-grey">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-dark-gray">Loading services...</p>
        </div>
      </main>
    );
  }

  const renderBundleDetail = () => {
    const bundle = bundles.find((b: Bundle) => b.id === selectedBundleId);
    if (!bundle) return null;

    return (
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Boxes className="h-6 w-6 text-sky-blue-accent" />
                  <h2 className="font-title-semibold text-dark-blue-night text-xl">{bundle.name}</h2>
                  {bundle.discountPercentage && parseFloat(bundle.discountPercentage) > 0 && (
                    <Badge variant="secondary">{bundle.discountPercentage}% off</Badge>
                  )}
                </div>
                {showPricing && bundle.finalPrice && (
                  <span className="text-sky-blue-accent font-title-semibold text-xl">
                    ${parseFloat(bundle.finalPrice).toFixed(2)}
                  </span>
                )}
              </div>
              {bundle.description && (
                <p className="text-dark-gray mb-6">{bundle.description}</p>
              )}
              <div className="border-t pt-4">
                <p className="text-dark-gray text-sm mb-4">
                  Bundle purchases are handled separately. Please contact our team to purchase this bundle.
                </p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={handleBack} data-testid="button-bundle-back">
                    Back
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderPackDetail = () => {
    const pack = servicePacks.find((p: ServicePack) => p.id === selectedPackId);
    if (!pack) return null;

    return (
      <div className="flex-1 p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-6 w-6 text-sky-blue-accent" />
                  <h2 className="font-title-semibold text-dark-blue-night text-xl">{pack.name}</h2>
                </div>
                {showPricing && pack.monthlyPrice && (
                  <span className="text-sky-blue-accent font-title-semibold text-xl">
                    ${parseFloat(pack.monthlyPrice).toFixed(2)}/mo
                  </span>
                )}
              </div>
              {pack.description && (
                <p className="text-dark-gray mb-6">{pack.description}</p>
              )}
              <div className="border-t pt-4">
                <p className="text-dark-gray text-sm mb-4">
                  Monthly pack subscriptions are handled separately. Please contact our team to subscribe to this pack.
                </p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={handleBack} data-testid="button-pack-back">
                    Back
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (selectedServiceId) {
      return renderServiceForm();
    }
    if (selectedBundleId) {
      return renderBundleDetail();
    }
    if (selectedPackId) {
      return renderPackDetail();
    }
    return renderServiceSelector();
  };

  return (
    <main className="flex flex-col w-full min-h-screen bg-light-grey">
      <Header />
      {renderContent()}
    </main>
  );
}
