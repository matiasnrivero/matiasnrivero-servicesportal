import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { DynamicFormField, type ServiceFieldWithInput } from "@/components/DynamicFormField";
import { FileUploader } from "@/components/FileUploader";
import { ArrowLeft, Package, Loader2, ClipboardList, CheckCircle, X } from "lucide-react";
import { Link } from "wouter";
import type { Bundle, Service, InputField, ServiceField, BundleField, InsertBundleRequest, User as UserType } from "@shared/schema";

interface EnrichedServiceField extends ServiceField {
  inputField: InputField | null;
  hasDefault: boolean;
}

interface ServiceWithFields {
  bundleItemId: string;
  serviceId: string;
  service: Service;
  fields: EnrichedServiceField[];
  allFields: EnrichedServiceField[];
}

interface EnrichedBundleField extends BundleField {
  inputField: InputField | null;
}

interface BundleFormStructure {
  bundle: Bundle;
  bundleFields: EnrichedBundleField[];
  services: ServiceWithFields[];
}

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
  clientProfileId?: string | null;
}

interface BillingInfo {
  paymentConfiguration: string;
  invoiceDay?: number;
  tripodDiscountTier?: string;
}

function applyTripodDiscount(price: number, discountTier: string): number {
  const discountPercent = 
    discountTier === "power_level" ? 10 :
    discountTier === "oms_subscription" ? 15 :
    discountTier === "enterprise" ? 20 : 0;
  
  if (discountPercent === 0) return price;
  return Math.ceil((price * (1 - discountPercent / 100)) * 100) / 100;
}

async function fetchBundleFormStructure(bundleId: string): Promise<BundleFormStructure> {
  const response = await fetch(`/api/bundles/${bundleId}/form-structure`);
  if (!response.ok) {
    throw new Error("Failed to fetch bundle form structure");
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

async function createBundleRequest(data: InsertBundleRequest) {
  const response = await fetch("/api/bundle-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to create bundle request");
  }
  return response.json();
}

export default function BundleRequestForm() {
  const params = useParams<{ bundleId: string }>();
  const bundleId = params.bundleId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [formData, setFormData] = useState<Record<string, any>>({});
  const [bundleHeaderData, setBundleHeaderData] = useState<Record<string, any>>({});
  const [selectedAssignee, setSelectedAssignee] = useState<string>("");
  
  const [couponCode, setCouponCode] = useState<string>("");
  const [validatedCoupon, setValidatedCoupon] = useState<{
    id: string;
    code: string;
    discountType: string;
    discountValue: string;
  } | null>(null);
  const [couponError, setCouponError] = useState<string>("");
  const [isValidatingCoupon, setIsValidatingCoupon] = useState<boolean>(false);

  const { data: bundleStructure, isLoading: isLoadingStructure, error: structureError } = useQuery({
    queryKey: ["/api/bundles", bundleId, "form-structure"],
    queryFn: () => fetchBundleFormStructure(bundleId!),
    enabled: !!bundleId,
  });

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const clientProfileId = currentUser?.clientProfileId;

  // Fetch billing info for Tri-POD discount tier
  const { data: billingInfo } = useQuery<BillingInfo>({
    queryKey: ["/api/client-companies", clientProfileId, "billing"],
    queryFn: async () => {
      const res = await fetch(`/api/billing/client-info?clientProfileId=${clientProfileId}`);
      if (!res.ok) throw new Error("Failed to fetch billing info");
      return res.json();
    },
    enabled: !!clientProfileId,
  });

  const tripodDiscountTier = billingInfo?.tripodDiscountTier || "none";
  const hasTripodDiscount = tripodDiscountTier !== "none";

  // Fetch designers that can be assigned to the bundle request
  const { data: designers } = useQuery<UserType[]>({
    queryKey: ["/api/users", "designers"],
    queryFn: async () => {
      // Fetch users who can be assigned: admin, internal_designer, vendor_designer
      const [admins, internalDesigners, vendorDesigners] = await Promise.all([
        fetch("/api/users?role=admin").then(r => r.json()),
        fetch("/api/users?role=internal_designer").then(r => r.json()),
        fetch("/api/users?role=vendor_designer").then(r => r.json()),
      ]);
      return [...admins, ...internalDesigners, ...vendorDesigners].filter((u: UserType) => u.isActive);
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertBundleRequest) => {
      return await createBundleRequest(data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bundle-requests"] });
      toast({
        title: "Request Submitted",
        description: "Your bundle request has been submitted successfully.",
      });
      setLocation("/service-requests?tab=bundle");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit bundle request.",
        variant: "destructive",
      });
    },
  });

  const handleFieldChange = (serviceId: string, fieldKey: string, value: any) => {
    const key = `${serviceId}_${fieldKey}`;
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleBundleHeaderFieldChange = (fieldId: string, value: any) => {
    setBundleHeaderData((prev) => ({
      ...prev,
      [`bundle_${fieldId}`]: value,
    }));
  };

  const handleServiceFileUpload = (serviceId: string, fieldKey: string, url: string, fileName: string) => {
    const key = `${serviceId}_${fieldKey}`;
    setFormData((prev) => {
      const existing = prev[key];
      const files = Array.isArray(existing) ? existing : [];
      return {
        ...prev,
        [key]: [...files, { url, fileName }],
      };
    });
  };

  const handleServiceFileRemove = (serviceId: string, fieldKey: string, fileName: string) => {
    const key = `${serviceId}_${fieldKey}`;
    setFormData((prev) => {
      const existing = prev[key];
      if (Array.isArray(existing)) {
        return {
          ...prev,
          [key]: existing.filter((f: { fileName: string }) => f.fileName !== fileName),
        };
      }
      return prev;
    });
  };

  const validateCoupon = async () => {
    if (!couponCode.trim()) {
      setCouponError("");
      setValidatedCoupon(null);
      return;
    }

    setIsValidatingCoupon(true);
    setCouponError("");

    try {
      const response = await fetch("/api/discount-coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: couponCode.trim().toUpperCase(),
          bundleId,
          clientId: currentUser?.userId,
          clientProfileId: currentUser?.clientProfileId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setCouponError(result.error || "Invalid coupon");
        setValidatedCoupon(null);
      } else {
        setValidatedCoupon(result.coupon);
        setCouponError("");
        toast({
          title: "Coupon Applied",
          description: `Discount: ${result.coupon.discountType === "percentage" ? `${result.coupon.discountValue}%` : `$${result.coupon.discountValue}`}`,
        });
      }
    } catch (error) {
      setCouponError("Failed to validate coupon");
      setValidatedCoupon(null);
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const clearCoupon = () => {
    setCouponCode("");
    setValidatedCoupon(null);
    setCouponError("");
  };

  const calculateDiscountedPrice = (basePrice: number): { discountAmount: number; finalPrice: number; priceAfterTripod: number } => {
    // First apply Tri-POD discount
    const priceAfterTripod = hasTripodDiscount ? applyTripodDiscount(basePrice, tripodDiscountTier) : basePrice;
    
    // Then apply coupon discount on top
    if (!validatedCoupon) {
      return { discountAmount: 0, finalPrice: priceAfterTripod, priceAfterTripod };
    }

    let discountAmount = 0;
    if (validatedCoupon.discountType === "percentage") {
      discountAmount = priceAfterTripod * (parseFloat(validatedCoupon.discountValue) / 100);
    } else {
      discountAmount = parseFloat(validatedCoupon.discountValue);
    }

    const finalPrice = Math.max(0, priceAfterTripod - discountAmount);
    return { discountAmount, finalPrice, priceAfterTripod };
  };

  const handleSubmit = () => {
    if (!bundleId || !bundleStructure) return;

    // Merge bundle header data with service form data
    const combinedFormData = { ...formData, ...bundleHeaderData };

    // Calculate the final price with Tri-POD discount applied
    const basePrice = parseFloat(bundle?.finalPrice || "0");
    const { discountAmount, finalPrice } = calculateDiscountedPrice(basePrice);

    const requestData = {
      bundleId,
      formData: combinedFormData,
      assigneeId: selectedAssignee || null,
      discountCouponId: validatedCoupon?.id || null,
      discountCouponCode: validatedCoupon?.code || null,
      discountAmount: discountAmount > 0 ? discountAmount.toFixed(2) : null,
      finalPrice: finalPrice.toFixed(2),
    };

    createMutation.mutate(requestData as InsertBundleRequest);
  };

  if (isLoadingStructure) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (structureError || !bundleStructure) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-8">
              <div className="text-center">
                <p className="text-destructive mb-4">
                  {structureError?.message || "Bundle not found"}
                </p>
                <Link href="/">
                  <Button data-testid="button-back-home">Back to Services</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { bundle, bundleFields: rawBundleFields, services } = bundleStructure;
  // Sort bundle fields by sortOrder and filter out delivery fields (only shown to designers)
  const allBundleFields = [...(rawBundleFields || [])]
    .filter(bf => bf.inputField?.inputFor !== "delivery")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  
  // Separate bundle fields by section
  const bundleFields = allBundleFields.filter(bf => bf.uiGroup !== "additional_info");
  const additionalInfoFields = allBundleFields.filter(bf => bf.uiGroup === "additional_info");
  // Filter out services whose fields are all delivery fields
  const servicesWithFields = services
    .map(s => ({
      ...s,
      fields: s.fields.filter(f => f.inputField?.inputFor !== "delivery")
    }))
    .filter((s) => s.fields.length > 0);

  // Helper to render bundle header field input
  const renderBundleHeaderField = (bf: EnrichedBundleField) => {
    if (!bf.inputField) return null;
    const inputField = bf.inputField;
    const fieldKey = `bundle_${bf.id}`;
    const value = bundleHeaderData[fieldKey] ?? bf.defaultValue ?? "";

    // For text/url/textarea fields, use description as placeholder inside the input
    // For dropdowns and quantity fields, show description as caption below
    const description = bf.helpTextOverride || inputField.description || "";
    const placeholderText = bf.placeholderOverride || description;

    // Special case: Discount Coupon field - render with Apply button and validation
    if (inputField.fieldKey === "discount_coupon") {
      // Only show to clients and admins when pricing is visible
      if (!showPricing) return null;
      
      const label = bf.displayLabelOverride || inputField.label;
      
      return (
        <div key={bf.id} className="space-y-2">
          <Label htmlFor="coupon" className="flex items-center gap-1">
            {label}
          </Label>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                id="coupon"
                placeholder={description || "Enter coupon code"}
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                disabled={!!validatedCoupon}
                className={`${validatedCoupon ? "pr-8 border-green-500 bg-green-50 dark:bg-green-900/20" : ""} ${couponError ? "border-destructive" : ""}`}
                data-testid="input-bundle-coupon-code"
              />
              {validatedCoupon && (
                <CheckCircle className="h-4 w-4 text-green-500 absolute right-2 top-1/2 -translate-y-1/2" />
              )}
            </div>
            {validatedCoupon ? (
              <Button
                type="button"
                variant="outline"
                onClick={clearCoupon}
                data-testid="button-clear-bundle-coupon"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={validateCoupon}
                disabled={isValidatingCoupon || !couponCode.trim()}
                data-testid="button-apply-bundle-coupon"
              >
                {isValidatingCoupon ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Apply"
                )}
              </Button>
            )}
          </div>
          {couponError && (
            <p className="text-sm text-destructive">{couponError}</p>
          )}
          {validatedCoupon && (
            <p className="text-sm text-green-600">
              Discount applied: {validatedCoupon.discountType === "percentage" 
                ? `${validatedCoupon.discountValue}% off` 
                : `$${parseFloat(validatedCoupon.discountValue).toFixed(2)} off`}
            </p>
          )}
        </div>
      );
    }

    switch (inputField.inputType) {
      case "text":
        return (
          <div key={bf.id} className="space-y-2">
            <Label htmlFor={fieldKey}>
              {bf.displayLabelOverride || inputField.label}
              {bf.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={fieldKey}
              placeholder={placeholderText}
              value={value}
              onChange={(e) => handleBundleHeaderFieldChange(bf.id, e.target.value)}
              data-testid={`input-bundle-${inputField.fieldKey}`}
            />
          </div>
        );
      case "date":
        return (
          <div key={bf.id} className="space-y-2">
            <Label htmlFor={fieldKey}>
              {bf.displayLabelOverride || inputField.label}
              {bf.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={fieldKey}
              type="date"
              value={value}
              onChange={(e) => handleBundleHeaderFieldChange(bf.id, e.target.value)}
              data-testid={`input-bundle-${inputField.fieldKey}`}
            />
          </div>
        );
      case "textarea":
        return (
          <div key={bf.id} className="space-y-2">
            <Label htmlFor={fieldKey}>
              {bf.displayLabelOverride || inputField.label}
              {bf.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              id={fieldKey}
              placeholder={placeholderText}
              value={value}
              onChange={(e) => handleBundleHeaderFieldChange(bf.id, e.target.value)}
              rows={3}
              data-testid={`input-bundle-${inputField.fieldKey}`}
            />
          </div>
        );
      case "dropdown":
        const options = bf.optionsJson || [];
        return (
          <div key={bf.id} className="space-y-2">
            <Label>
              {bf.displayLabelOverride || inputField.label}
              {bf.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Select
              value={value}
              onValueChange={(v) => handleBundleHeaderFieldChange(bf.id, v)}
            >
              <SelectTrigger data-testid={`select-bundle-${inputField.fieldKey}`}>
                <SelectValue placeholder={`Select ${inputField.label}`} />
              </SelectTrigger>
              <SelectContent>
                {(Array.isArray(options) ? options : []).map((opt: string) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        );
      case "file":
        const fileValue = bundleHeaderData[fieldKey] || [];
        const files = Array.isArray(fileValue) ? fileValue : [];
        return (
          <div key={bf.id} className="space-y-2">
            <Label>
              {bf.displayLabelOverride || inputField.label}
              {bf.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <FileUploader
              onUploadComplete={(url, fileName) => {
                const newFiles = [...files, { url, fileName }];
                setBundleHeaderData((prev) => ({
                  ...prev,
                  [fieldKey]: newFiles,
                }));
              }}
              onFileRemove={(fileName) => {
                const newFiles = files.filter((f: { fileName: string }) => f.fileName !== fileName);
                setBundleHeaderData((prev) => ({
                  ...prev,
                  [fieldKey]: newFiles,
                }));
              }}
            />
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        );
      default:
        return (
          <div key={bf.id} className="space-y-2">
            <Label htmlFor={fieldKey}>
              {bf.displayLabelOverride || inputField.label}
              {bf.required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={fieldKey}
              placeholder={placeholderText}
              value={value}
              onChange={(e) => handleBundleHeaderFieldChange(bf.id, e.target.value)}
              data-testid={`input-bundle-${inputField.fieldKey}`}
            />
          </div>
        );
    }
  };

  // Check if we have bundle-level fields to show
  const hasBundleFields = bundleFields && bundleFields.length > 0;
  // Only Admin and Internal Designer can see the Assign To field
  const showAssigneeSelector = currentUser?.role === "admin" || currentUser?.role === "internal_designer";
  const showPricing = currentUser?.role === "client" || currentUser?.role === "admin";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      {/* Topbar - matching ad-hoc service form style */}
      <div className="bg-gradient-to-r from-dark-blue-night to-space-cadet px-8 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <Link href="/?tab=bundle">
            <Button variant="outline" className="bg-white hover:bg-gray-100" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            data-testid="button-submit-top"
          >
            {createMutation.isPending ? "Submitting..." : "Submit Request"}
          </Button>
        </div>
      </div>

      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          {/* Bundle Header - matching ad-hoc service form style */}
          <div className="mb-6">
            <h1 className="font-title-semibold text-dark-blue-night text-2xl flex items-center gap-3" data-testid="text-bundle-name">
              {bundle.name}
              {showPricing && bundle.finalPrice && (() => {
                const basePrice = parseFloat(bundle.finalPrice);
                const { finalPrice, priceAfterTripod } = calculateDiscountedPrice(basePrice);
                const hasAnyDiscount = hasTripodDiscount || validatedCoupon;
                
                if (hasAnyDiscount) {
                  return (
                    <span className="flex items-center gap-2">
                      <span className="text-sky-blue-accent font-body-2-semibold">
                        ${finalPrice.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground line-through text-sm">
                        ${basePrice.toFixed(2)}
                      </span>
                      {validatedCoupon && (
                        <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">
                          -{validatedCoupon.discountType === "percentage" ? `${validatedCoupon.discountValue}%` : `$${parseFloat(validatedCoupon.discountValue).toFixed(2)}`}
                        </span>
                      )}
                    </span>
                  );
                }
                return (
                  <span className="text-sky-blue-accent font-body-2-semibold">
                    ${basePrice.toFixed(2)}
                  </span>
                );
              })()}
            </h1>
            {bundle.description && (
              <p className="font-body-reg text-dark-gray mt-1">{bundle.description}</p>
            )}
          </div>

        {/* Bundle Header Section - General Info */}
        {(hasBundleFields || showAssigneeSelector || showPricing) && (
          <Card className="mb-6">
            <CardHeader className="flex flex-row items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                <ClipboardList className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg">General Information</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Enter details that apply to all services in this bundle
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Assignee Selector (for non-clients) */}
              {showAssigneeSelector && (
                <div className="space-y-2">
                  <Label htmlFor="assignee" className="flex items-center gap-1">
                    Assign To
                  </Label>
                  <Select value={selectedAssignee} onValueChange={setSelectedAssignee}>
                    <SelectTrigger data-testid="select-bundle-assignee">
                      <SelectValue placeholder="Select a designer (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {designers?.map((designer) => (
                        <SelectItem key={designer.id} value={designer.id}>
                          {designer.username} ({designer.role.replace(/_/g, " ")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Bundle-level Input Fields */}
              {bundleFields?.map((bf) => renderBundleHeaderField(bf))}
            </CardContent>
          </Card>
        )}

        {servicesWithFields.length > 0 ? (
          <div className="space-y-6">
            {servicesWithFields.map((serviceData) => (
              <Card key={serviceData.serviceId}>
                <CardHeader>
                  <CardTitle className="text-lg" data-testid={`text-service-${serviceData.serviceId}`}>
                    {serviceData.service.title}
                  </CardTitle>
                  {serviceData.service.description && (
                    <p className="text-sm text-muted-foreground">
                      {serviceData.service.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {serviceData.fields.map((field) => (
                      <DynamicFormField
                        key={field.id}
                        field={field as ServiceFieldWithInput}
                        value={formData[`${serviceData.serviceId}_${field.inputField?.fieldKey}`]}
                        onChange={(fieldKey, value) =>
                          handleFieldChange(serviceData.serviceId, fieldKey, value)
                        }
                        showPricing={currentUser?.role === "client" || currentUser?.role === "admin"}
                        onFileUpload={(fieldKey, url, fileName) => handleServiceFileUpload(serviceData.serviceId, fieldKey, url, fileName)}
                        onFileRemove={(fieldKey, fileName) => handleServiceFileRemove(serviceData.serviceId, fieldKey, fileName)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="mb-6">
            <CardContent className="py-6">
              <p className="text-muted-foreground text-center">
                This bundle uses preset values for all fields. No additional input is required.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Additional Information Section - only show if there are fields assigned */}
        {additionalInfoFields.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {additionalInfoFields.map((bf) => renderBundleHeaderField(bf))}
            </CardContent>
          </Card>
        )}

        <Separator className="my-6" />

        <div className="flex justify-end gap-4">
          <Link href="/?tab=bundle">
            <Button variant="outline" data-testid="button-cancel">
              Cancel
            </Button>
          </Link>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            data-testid="button-submit"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Request"
            )}
          </Button>
        </div>
        </div>
      </div>
    </div>
  );
}
