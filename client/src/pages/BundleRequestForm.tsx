import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Header } from "@/components/Header";
import { DynamicFormField, type ServiceFieldWithInput } from "@/components/DynamicFormField";
import { FileUploader } from "@/components/FileUploader";
import { ArrowLeft, Package, Loader2 } from "lucide-react";
import { Link } from "wouter";
import type { Bundle, Service, InputField, ServiceField, InsertBundleRequest } from "@shared/schema";

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

interface BundleFormStructure {
  bundle: Bundle;
  services: ServiceWithFields[];
}

interface CurrentUser {
  userId: string;
  role: string;
  username: string;
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
  const [notes, setNotes] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ url: string; fileName: string }>>([]);

  const { data: bundleStructure, isLoading: isLoadingStructure, error: structureError } = useQuery({
    queryKey: ["/api/bundles", bundleId, "form-structure"],
    queryFn: () => fetchBundleFormStructure(bundleId!),
    enabled: !!bundleId,
  });

  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ["/api/default-user"],
    queryFn: getDefaultUser,
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertBundleRequest) => {
      const request = await createBundleRequest(data);
      
      if (uploadedFiles.length > 0) {
        await Promise.all(
          uploadedFiles.map((file) =>
            fetch(`/api/bundle-requests/${request.id}/attachments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fileName: file.fileName,
                fileUrl: file.url,
                kind: "request",
              }),
            })
          )
        );
      }
      
      return request;
    },
    onSuccess: (result) => {
      toast({
        title: "Request Submitted",
        description: "Your bundle request has been submitted successfully.",
      });
      setLocation("/service-requests");
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

  const handleFileUpload = (url: string, fileName: string) => {
    setUploadedFiles((prev) => [...prev, { url, fileName }]);
  };

  const handleFileRemove = (fileName: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.fileName !== fileName));
  };

  const handleSubmit = () => {
    if (!bundleId) return;

    const requestData = {
      bundleId,
      formData,
      notes: notes || null,
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

  const { bundle, services } = bundleStructure;
  const servicesWithFields = services.filter((s) => s.fields.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
        </div>

        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle data-testid="text-bundle-name">{bundle.name}</CardTitle>
              {bundle.description && (
                <p className="text-sm text-muted-foreground mt-1">{bundle.description}</p>
              )}
            </div>
          </CardHeader>
        </Card>

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
                        onFileUpload={(fieldKey, url, fileName) => handleFileUpload(url, fileName)}
                        onFileRemove={(fieldKey, fileName) => handleFileRemove(fileName)}
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

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Additional Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any additional notes or special instructions for your request..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                data-testid="textarea-notes"
              />
            </div>

            <div className="space-y-2">
              <Label>Attachments (optional)</Label>
              <FileUploader
                onUploadComplete={handleFileUpload}
                onFileRemove={handleFileRemove}
              />
              {uploadedFiles.length > 0 && (
                <div className="mt-2 space-y-1">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.fileName}
                      className="flex items-center justify-between text-sm p-2 bg-muted rounded"
                    >
                      <span className="truncate">{file.fileName}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFileRemove(file.fileName)}
                        data-testid={`button-remove-file-${file.fileName}`}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Separator className="my-6" />

        <div className="flex justify-end gap-4">
          <Link href="/">
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
  );
}
