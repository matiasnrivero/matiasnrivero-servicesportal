import { useState } from "react";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileUploader } from "@/components/FileUploader";
import { HelpCircle, X } from "lucide-react";
import type { InputField, ServiceField } from "@shared/schema";

export interface ServiceFieldWithInput extends ServiceField {
  inputField: InputField | null;
}

interface FieldOption {
  value: string;
  label: string;
  price?: number;
}

interface DynamicFormFieldProps {
  field: ServiceFieldWithInput;
  value: any;
  onChange: (fieldKey: string, value: any) => void;
  showPricing?: boolean;
  onFileUpload?: (fieldKey: string, url: string, fileName: string) => void;
  onFileRemove?: (fieldKey: string, fileName: string) => void;
  customContent?: React.ReactNode;
}

export function DynamicFormField({
  field,
  value,
  onChange,
  showPricing = true,
  onFileUpload,
  onFileRemove,
  customContent,
}: DynamicFormFieldProps) {
  const [chipInput, setChipInput] = useState("");

  if (!field.inputField) return null;

  const inputField = field.inputField;
  const fieldKey = inputField.fieldKey;
  const label = field.displayLabelOverride || inputField.label;
  const description = field.helpTextOverride || inputField.description || "";
  const isRequired = field.required;
  const inputType = inputField.inputType;
  const valueMode = inputField.valueMode;
  
  // For text-based inputs, use description as placeholder
  // For non-text inputs (dropdown, date, file, number), show tooltip
  const isTextBasedInput = ["text", "textarea", "url", "chips"].includes(inputType);
  const placeholder = field.placeholderOverride || (isTextBasedInput ? description : "");
  const showTooltip = !isTextBasedInput && description;

  const getOptions = (): FieldOption[] => {
    if (field.optionsJson && Array.isArray(field.optionsJson)) {
      return field.optionsJson.map((opt: any) => {
        if (typeof opt === 'string') {
          return { value: opt, label: opt };
        }
        return opt as FieldOption;
      });
    }
    return [];
  };

  const handleChipKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === ",") {
      e.preventDefault();
      const trimmed = chipInput.trim().replace(/,/g, "");
      if (trimmed) {
        const currentChips = Array.isArray(value) ? value : [];
        if (!currentChips.includes(trimmed)) {
          onChange(fieldKey, [...currentChips, trimmed]);
        }
        setChipInput("");
      }
    }
  };

  const removeChip = (chipToRemove: string) => {
    const currentChips = Array.isArray(value) ? value : [];
    onChange(fieldKey, currentChips.filter((c: string) => c !== chipToRemove));
  };

  const renderField = () => {
    switch (inputType) {
      case "text":
        return (
          <Input
            placeholder={placeholder || "Enter text"}
            value={value || ""}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            data-testid={`input-${fieldKey}`}
          />
        );

      case "textarea":
        return (
          <Textarea
            placeholder={placeholder || "Enter text"}
            value={value || ""}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            rows={3}
            data-testid={`textarea-${fieldKey}`}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            placeholder={placeholder || "0"}
            value={value || ""}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            data-testid={`input-${fieldKey}`}
          />
        );

      case "dropdown":
        const dropdownOptions = getOptions();
        // If valueMode is "multi", render as multi-select checkboxes
        if (valueMode === "multi" && dropdownOptions.length > 0) {
          const selectedValues = Array.isArray(value) ? value : [];
          return (
            <div className="border rounded-md p-3 space-y-2 bg-white dark:bg-background">
              {dropdownOptions.map((opt) => (
                <div key={opt.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`${fieldKey}-${opt.value}`}
                    checked={selectedValues.includes(opt.value)}
                    onCheckedChange={(checked) => {
                      // Explicitly check for true/false to handle tri-state Checkbox output
                      if (checked === true) {
                        onChange(fieldKey, [...selectedValues, opt.value]);
                      } else if (checked === false) {
                        onChange(fieldKey, selectedValues.filter((v: string) => v !== opt.value));
                      }
                      // Ignore "indeterminate" state
                    }}
                    data-testid={`checkbox-${fieldKey}-${opt.value}`}
                  />
                  <Label htmlFor={`${fieldKey}-${opt.value}`} className="font-normal cursor-pointer">
                    {showPricing && opt.price !== undefined
                      ? `${opt.label} - $${opt.price}`
                      : opt.label}
                  </Label>
                </div>
              ))}
            </div>
          );
        }
        return (
          <Select 
            value={value || ""} 
            onValueChange={(v) => onChange(fieldKey, v)}
          >
            <SelectTrigger data-testid={`select-${fieldKey}`}>
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {dropdownOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {showPricing && opt.price !== undefined
                    ? `${opt.label} - $${opt.price}`
                    : opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "multi_select":
        const multiOptions = getOptions();
        const multiSelectedValues = Array.isArray(value) ? value : [];
        return (
          <div className="border rounded-md p-3 space-y-2 bg-white dark:bg-background">
            {multiOptions.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <Checkbox
                  id={`${fieldKey}-${opt.value}`}
                  checked={multiSelectedValues.includes(opt.value)}
                  onCheckedChange={(checked) => {
                    // Explicitly check for true/false to handle tri-state Checkbox output
                    if (checked === true) {
                      onChange(fieldKey, [...multiSelectedValues, opt.value]);
                    } else if (checked === false) {
                      onChange(fieldKey, multiSelectedValues.filter((v: string) => v !== opt.value));
                    }
                    // Ignore "indeterminate" state
                  }}
                  data-testid={`checkbox-${fieldKey}-${opt.value}`}
                />
                <Label htmlFor={`${fieldKey}-${opt.value}`} className="font-normal cursor-pointer">
                  {showPricing && opt.price !== undefined
                    ? `${opt.label} - $${opt.price}`
                    : opt.label}
                </Label>
              </div>
            ))}
          </div>
        );

      case "radio":
        const radioOptions = getOptions();
        return (
          <div className="space-y-2">
            {radioOptions.map((opt) => (
              <div key={opt.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  id={`${fieldKey}-${opt.value}`}
                  name={fieldKey}
                  value={opt.value}
                  checked={value === opt.value}
                  onChange={(e) => onChange(fieldKey, e.target.value)}
                  className="w-4 h-4"
                  data-testid={`radio-${fieldKey}-${opt.value}`}
                />
                <Label htmlFor={`${fieldKey}-${opt.value}`} className="font-normal cursor-pointer">
                  {showPricing && opt.price !== undefined
                    ? `${opt.label} - $${opt.price}`
                    : opt.label}
                </Label>
              </div>
            ))}
          </div>
        );

      case "checkbox":
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              id={fieldKey}
              checked={!!value}
              onCheckedChange={(checked) => onChange(fieldKey, checked === true)}
              data-testid={`checkbox-${fieldKey}`}
            />
            <Label htmlFor={fieldKey} className="font-normal cursor-pointer flex items-center gap-1">
              {label}
              {description && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-dark-gray cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="bg-dark-blue-night text-white max-w-[200px]">
                    <p>{description}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </Label>
          </div>
        );

      case "file":
        return (
          <FileUploader
            onUploadComplete={(url, name) => onFileUpload?.(fieldKey, url, name)}
            onFileRemove={(fileName) => onFileRemove?.(fieldKey, fileName)}
          />
        );

      case "url":
        return (
          <Input
            type="url"
            placeholder={placeholder || "https://example.com"}
            value={value || ""}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            data-testid={`input-${fieldKey}`}
          />
        );

      case "date":
        return (
          <Input
            type="date"
            value={value || ""}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            data-testid={`input-${fieldKey}`}
          />
        );

      case "chips":
        const chips = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-2">
            <Input
              placeholder={placeholder || "Type and press Enter to add"}
              value={chipInput}
              onChange={(e) => setChipInput(e.target.value)}
              onKeyDown={handleChipKeyDown}
              data-testid={`input-${fieldKey}`}
            />
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {chips.map((chip: string, index: number) => (
                  <Badge 
                    key={index} 
                    variant="secondary" 
                    className="flex items-center gap-1"
                  >
                    {chip}
                    <button
                      type="button"
                      onClick={() => removeChip(chip)}
                      className="ml-1"
                      data-testid={`remove-chip-${fieldKey}-${index}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return (
          <Input
            placeholder={placeholder || "Enter value"}
            value={value || ""}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            data-testid={`input-${fieldKey}`}
          />
        );
    }
  };

  if (inputType === "checkbox") {
    return (
      <div className="space-y-2">
        {renderField()}
        {customContent}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1">
        {label}
        {isRequired && <span className="text-destructive">*</span>}
        {showTooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-4 w-4 text-dark-gray cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="bg-dark-blue-night text-white max-w-[200px]">
              <p>{description}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </Label>
      {renderField()}
      {customContent}
    </div>
  );
}
