import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Service, InsertServiceRequest } from "@shared/schema";
import { NavigationMenuSection } from "./sections/NavigationMenuSection";

async function fetchServices(): Promise<Service[]> {
  const response = await fetch("/api/services");
  if (!response.ok) {
    throw new Error("Failed to fetch services");
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

export default function ServiceRequestForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: services = [] } = useQuery({
    queryKey: ["services"],
    queryFn: fetchServices,
  });

  const [selectedServiceId, setSelectedServiceId] = React.useState<string>("");
  const { register, handleSubmit, reset, setValue } = useForm();

  const mutation = useMutation({
    mutationFn: createServiceRequest,
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Service request created successfully",
      });
      reset();
      setSelectedServiceId("");
      queryClient.invalidateQueries({ queryKey: ["service-requests"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create service request",
        variant: "destructive",
      });
    },
  });

  const selectedService = services.find((s) => s.id === selectedServiceId);

  const onSubmit = (data: any) => {
    mutation.mutate({
      userId: "default-user",
      serviceId: selectedServiceId,
      status: "pending",
      ...data,
      quantity: data.quantity ? parseInt(data.quantity) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    });
  };

  return (
    <main className="flex w-full max-w-[1440px] min-w-[1440px] min-h-screen bg-light-grey">
      <NavigationMenuSection />
      <div className="flex-1 p-8">
        <Card className="max-w-3xl mx-auto">
          <CardHeader>
            <CardTitle className="font-title-semibold text-dark-blue-night text-2xl">
              Create Service Request
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="service">Service Type *</Label>
                <Select
                  value={selectedServiceId}
                  onValueChange={(value) => {
                    setSelectedServiceId(value);
                    setValue("serviceId", value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services.map((service) => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.title} - {service.priceRange}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedService && (
                <div className="p-4 bg-blue-lavender rounded-lg">
                  <p className="font-body-2-reg text-dark-blue-night">
                    {selectedService.description}
                  </p>
                  <p className="font-body-3-reg text-dark-gray mt-2">
                    Decoration Methods: {selectedService.decorationMethods}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="orderNumber">Order Number</Label>
                <Input
                  id="orderNumber"
                  {...register("orderNumber")}
                  placeholder="e.g., ORD-12345"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name</Label>
                <Input
                  id="customerName"
                  {...register("customerName")}
                  placeholder="Customer or company name"
                />
              </div>

              {selectedService?.decorationMethods && (
                <div className="space-y-2">
                  <Label htmlFor="decorationMethod">Decoration Method</Label>
                  <Select onValueChange={(value) => setValue("decorationMethod", value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select decoration method" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedService.decorationMethods.split(",").map((method) => (
                        <SelectItem key={method.trim()} value={method.trim()}>
                          {method.trim()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  {...register("quantity")}
                  placeholder="Number of items"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  {...register("dueDate")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="requirements">Requirements & Specifications</Label>
                <Textarea
                  id="requirements"
                  {...register("requirements")}
                  placeholder="Describe your specific requirements, colors, sizes, etc."
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  {...register("notes")}
                  placeholder="Any additional information or special instructions"
                  rows={3}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  type="submit"
                  className="bg-sky-blue-accent hover:bg-sky-blue-accent/90 text-white"
                  disabled={!selectedServiceId || mutation.isPending}
                >
                  {mutation.isPending ? "Submitting..." : "Submit Request"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    reset();
                    setSelectedServiceId("");
                  }}
                >
                  Clear Form
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
