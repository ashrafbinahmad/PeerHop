import React, { useState, useEffect } from "react";
import axios from "axios";
import { PlatformIcon } from "../../components/PlatformIcon";
import { Pencil } from "lucide-react";
import type { Client } from "../../hooks/useDevices";

export const EditableDeviceName = ({
  client,
  isDarkMode,
  theme,
  serverUrl,
  adminToken,
  onBlock,
  onBlockSending,
}: {
  client: Client;
  isDarkMode: boolean;
  theme: any;
  serverUrl: string;
  adminToken: string;
  onBlock: (client: Client) => void;
  onBlockSending: (client: Client) => void;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(client.name || client.platform);

  // Update name if client data changes from backend
  useEffect(() => {
    if (client.name && !isEditing) {
      setName(client.name);
    }
  }, [client.name, isEditing]);

  const handleUpdateName = async () => {
    if (!name.trim()) {
      setName(client.name || client.platform);
      setIsEditing(false);
      return;
    }

    try {
      const url = adminToken
        ? `${serverUrl}/api/update-client-name?admin=${adminToken}`
        : `${serverUrl}/api/update-client-name`;
      await axios.post(url, {
        ip: client.ip,
        name: name.trim(),
      });
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update name:", err);
      // Revert name on error
      setName(client.name || client.platform);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${theme.deviceItemBg}`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center ${theme.iconBg} ${theme.iconText}`}
      >
        <PlatformIcon platform={client.platform} size={16} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleUpdateName}
              onKeyDown={(e) => e.key === "Enter" && handleUpdateName()}
              className={`text-sm font-medium w-full px-1 py-0.5 rounded border ${
                isDarkMode
                  ? "bg-slate-900 border-slate-700 text-white"
                  : "bg-white border-gray-200 text-gray-900"
              }`}
              autoFocus
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 group">
            <div className={`text-sm font-medium truncate ${theme.text}`}>
              {client.name || client.platform}
            </div>
            <button
              onClick={() => setIsEditing(true)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-black/5 transition-opacity"
              title="Edit name"
            >
              <Pencil
                size={10}
                className={isDarkMode ? "text-slate-400" : "text-gray-400"}
              />
            </button>
          </div>
        )}
        <div className={`text-[10px] truncate font-mono ${theme.subText}`}>
          {client.ip}
        </div>

        <div className="flex gap-2 mt-1">
          {/* Block Sending Button */}
          <button
            onClick={() => onBlockSending(client)}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              client.sendingBlocked
                ? "bg-yellow-500/20 text-yellow-600 hover:bg-yellow-500/30 dark:text-yellow-400"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
            }`}
          >
            {client.sendingBlocked ? "Allow Sending" : "Block Sending"}
          </button>

          {/* Block/Unblock Button */}
          <button
            onClick={() => onBlock(client)}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
              client.blocked
                ? "bg-green-500/20 text-green-600 hover:bg-green-500/30"
                : "bg-red-500/20 text-red-600 hover:bg-red-500/30"
            }`}
          >
            {client.blocked ? "🔓 Unblock" : "🚫 Block"}
          </button>
        </div>
      </div>
      <div
        className={`w-1.5 h-1.5 rounded-full ${
          client.blocked
            ? "bg-red-500"
            : client.sendingBlocked
              ? "bg-yellow-500"
              : "bg-green-500"
        }`}
      ></div>
    </div>
  );
};
