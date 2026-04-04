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
  initialEmail?: string;
  initialName?: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  featureDescription?: string;
}

export const FeatureRequestForm: React.FC<FeatureRequestFormProps> = ({
  isOpen,
  onClose,
  logActivity,
  setNotification,
  theme,
  initialEmail = "",
  initialName = "",
}) => {
  const { t } = useTranslation();
  const [requestName, setRequestName] = React.useState("");
  const [requestEmail, setRequestEmail] = React.useState("");
  const [requestFeatureDescription, setRequestFeatureDescription] =
    React.useState("");
  const [errors, setErrors] = React.useState<FormErrors>({});

  React.useEffect(() => {
    if (initialEmail && !requestEmail) {
      setRequestEmail(initialEmail);
    }
    if (initialName && !requestName) {
      setRequestName(initialName);
    }
  }, [initialEmail, initialName]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (requestEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestEmail)) {
      newErrors.email =
        t("error_email_invalid") || "Please enter a valid email address.";
    }

    if (!requestFeatureDescription.trim()) {
      newErrors.featureDescription =
        t("error_feature_description_required") ||
        "Feature description is required.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFeatureRequestSubmit = () => {
    if (!validate()) return;

    const payload = {
      name: requestName,
      email: requestEmail,
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
        className={`absolute bottom-0 left-0 w-full z-50 backdrop-blur-sm h-full ${theme.isDark ? "bg-black/50" : "bg-white/50"}`}
        onClick={onClose}
      />
      <div className="absolute bottom-0 left-0 w-full z-50 flex">
        <div
          className={`relative ml-auto w-full h-full shadow-xl p-6 overflow-y-auto hide-scrollbar rounded-t-md transition-all ${theme.bg} ${theme.isDark ? "text-slate-100" : "text-slate-900"}`}
          onClick={(e) => e.stopPropagation()}
          style={{ height: isOpen ? "33rem" : 0 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-start">
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
              <label className="block text-sm font-medium mb-1 text-start">
                {t("name") || "Name"}{" "}
                <span className="text-[10px] font-normal opacity-50 ml-1">
                  ({t("optional") || "Optional"})
                </span>
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
              <label className="block text-sm font-medium mb-1 text-start">
                {t("email") || "Email"}{" "}
                <span className="text-[10px] font-normal opacity-50 ml-1">
                  ({t("optional") || "Optional"})
                </span>
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
              <label className="block text-sm font-medium mb-1 text-start">
                {t("feature_description") || "Feature description"}{" "}
                <span className="text-red-500 ml-1">*</span>
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
                className={`${inputClass(!!errors.featureDescription)} resize-none`}
                rows={4}
              />
              {errors.featureDescription && (
                <p className={errorClass}>{errors.featureDescription}</p>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  const isInvalidEmail =
                    requestEmail &&
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestEmail);
                  if (isInvalidEmail) {
                    setRequestEmail("");
                  }
                  setRequestFeatureDescription("");
                  setErrors({});
                  onClose();
                }}
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
