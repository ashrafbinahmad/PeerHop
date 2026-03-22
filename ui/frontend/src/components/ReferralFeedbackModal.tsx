import React, { useState, useEffect } from "react";
import { markAsReviewed } from "../hooks/useActivity";

interface ReferralFeedbackModalProps {
  onTriggerReview?: () => Promise<void>;
}

export const ReferralFeedbackModal: React.FC<ReferralFeedbackModalProps> = ({
  onTriggerReview,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);

  useEffect(() => {
    const handleShowFeedback = () => {
      setIsOpen(true);
      setRating(0); // Reset rating
    };

    window.addEventListener("showReferralFeedback", handleShowFeedback);
    return () => {
      window.removeEventListener("showReferralFeedback", handleShowFeedback);
    };
  }, []);

  const handleSubmit = async () => {
    if (rating === 0) return; // Ensure a rating is selected

    // Mark as reviewed in localStorage
    markAsReviewed();

    // Trigger the review flow (Wails backend or fallback)
    if (onTriggerReview) {
      await onTriggerReview();
    }

    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">
          How likely would you recommend PeerHop?
        </h2>
        <p className="text-gray-600 mb-6">
          How firmly will you refer this to your friend?
        </p>

        {/* 6-Star Rating */}
        <div className="flex justify-center gap-3 mb-8">
          {[1, 2, 3, 4, 5, 6].map((star) => (
            <button
              key={star}
              type="button"
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              onClick={() => setRating(star)}
              className="focus:outline-none transition-transform hover:scale-110"
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill={star <= (hoveredRating || rating) ? "#fbbf24" : "#e5e7eb"}
                stroke={
                  star <= (hoveredRating || rating) ? "#f59e0b" : "#d1d5db"
                }
                strokeWidth="1"
                className="transition-colors"
              >
                <path d="M20 2 L25.355 15.055 L39.03 15.055 L28.115 23.485 L33.47 36.54 L22.555 28.11 L11.64 36.54 L16.995 23.485 L6.08 15.055 L19.755 15.055 Z" />
              </svg>
            </button>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={rating === 0}
            className={`flex-1 px-4 py-2 rounded-lg font-medium text-white transition-colors ${
              rating === 0
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
};
