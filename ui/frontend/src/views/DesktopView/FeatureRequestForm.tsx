import React from "react";
import { useTranslation } from "../../hooks/useTranslation";
import type { ActivityType } from "../../hooks/useActivity";
import { Theme } from "../../themeConstants";

interface FeatureRequestFormProps {
  isOpen: boolean;
  onClose: () => void;
  logActivity: (type: ActivityType, message: string) => void;
  setNotification: (notification: { show: boolean; message: string }) => void;
  theme: Theme;
}

interface FormErrors {
  name?: string;
  email?: string;
  featureShort?: string;
  featureDescription?: string;
}

export const FeatureRequestForm: React.FC<FeatureRequestFormProps> = ({
  isOpen,
  onClose,
  logActivity,
  setNotification,
  theme,
}) => {
  const { t } = useTranslation();
  const [requestName, setRequestName] = React.useState("");
  const [requestEmail, setRequestEmail] = React.useState("");
  const [requestFeatureShort, setRequestFeatureShort] = React.useState("");
  const [requestFeatureDescription, setRequestFeatureDescription] =
    React.useState("");
  const [errors, setErrors] = React.useState<FormErrors>({});

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (requestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestEmail)) {
      newErrors.email =
        t("error_email_invalid") || "Please enter a valid email address.";
    }

    if (!requestFeatureShort.trim() && !requestFeatureDescription.trim()) {
      newErrors.featureShort =
        t("error_feature_short_or_description_required") ||
        "Feature title or details is required.";
      newErrors.featureDescription = newErrors.featureShort;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFeatureRequestSubmit = () => {
    if (!validate()) return;

    const payload = {
      name: requestName,
      email: requestEmail,
      short: requestFeatureShort,
      description: requestFeatureDescription,
    };

    logActivity(
      "feature_request_submitted",
      `Feature request submitted: ${JSON.stringify(payload)}`,
    );

    setNotification({
      show: true,
      message:
        t("feature_request_submitted") ||
        "Feature request submitted. Thank you!",
    });
    setTimeout(() => setNotification({ show: false, message: "" }), 3000);

    setRequestName("");
    setRequestEmail("");
    setRequestFeatureShort("");
    setRequestFeatureDescription("");
    setErrors({});
    onClose();
  };

  const errorClass = "mt-1 text-xs text-red-500";

  const inputClass = (hasError: boolean) =>
    `w-full rounded-md border px-3 py-2 text-sm ${theme.inputAreaBg} ${
      hasError
        ? "border-red-500"
        : theme.isDark
          ? "border-slate-700"
          : "border-gray-300"
    }`;

  return (
    <div
      style={{
        pointerEvents: !isOpen ? "none" : "all",
        opacity: isOpen ? 1 : 0,
      }}
    >
      <div
        className={`absolute bottom-0 left-0 w-full z-50 backdrop-blur-sm h-full ${theme.isDark ? "bg-black/50" : "bg-white/90"}`}
        onClick={onClose}
      />
      <div className="absolute bottom-0 left-0 w-full z-50 flex">
        <div
          className={`relative ml-auto w-full h-full shadow-xl p-6 overflow-y-auto hide-scrollbar rounded-t-md transition-all ${theme.bg} ${theme.isDark ? "text-slate-100" : "text-slate-900"}`}
          onClick={(e) => e.stopPropagation()}
          style={{ height: isOpen ? "35rem" : 0 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {t("request_feature") || "Request feature"}
            </h2>
            <button
              className={
                theme.isDark
                  ? "text-slate-400 hover:text-slate-100"
                  : "text-slate-500 hover:text-slate-800"
              }
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleFeatureRequestSubmit();
            }}
            noValidate
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("name") || "Name"}
              </label>
              <input
                type="text"
                value={requestName}
                onChange={(e) => {
                  setRequestName(e.target.value);
                  if (errors.name)
                    setErrors((prev) => ({ ...prev, name: undefined }));
                }}
                className={inputClass(!!errors.name)}
              />
              {errors.name && <p className={errorClass}>{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t("email") || "Email"}
              </label>
              <input
                type="email"
                value={requestEmail}
                onChange={(e) => {
                  setRequestEmail(e.target.value);
                  if (errors.email)
                    setErrors((prev) => ({ ...prev, email: undefined }));
                }}
                className={inputClass(!!errors.email)}
              />
              {errors.email && <p className={errorClass}>{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t("feature_short") || "Feature (short)"}
              </label>
              <input
                type="text"
                value={requestFeatureShort}
                onChange={(e) => {
                  setRequestFeatureShort(e.target.value);
                  if (errors.featureShort)
                    setErrors((prev) => ({ ...prev, featureShort: undefined }));
                }}
                className={inputClass(!!errors.featureShort)}
              />
              {errors.featureShort && (
                <p className={errorClass}>{errors.featureShort}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                {t("feature_description") || "Description"}
              </label>
              <textarea
                value={requestFeatureDescription}
                onChange={(e) => {
                  setRequestFeatureDescription(e.target.value);
                  if (errors.featureDescription)
                    setErrors((prev) => ({
                      ...prev,
                      featureDescription: undefined,
                    }));
                }}
                className={inputClass(!!errors.featureDescription)}
                rows={4}
              />
              {errors.featureDescription && (
                <p className={errorClass}>{errors.featureDescription}</p>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-2 rounded-lg border text-sm ${theme.isDark ? "border-slate-700" : "border-gray-300"}`}
              >
                {t("cancel") || "Cancel"}
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors"
                style={{ backgroundColor: theme.accentColor }}
              >
                {t("submit") || "Submit"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
