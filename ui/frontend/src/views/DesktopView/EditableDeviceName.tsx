import React, { useState, useEffect } from "react";
import axios from "axios";
import { PlatformIcon } from "../../components/PlatformIcon";
import { Pencil, ShieldCheck, ShieldX, Ban, UserCheck, Globe, MoreHorizontal } from "lucide-react";
import type { Client } from "../../hooks/useDevices";

export const EditableDeviceName = ({
  client,
  isDarkMode,
  theme,
  serverUrl,
  adminToken,
  onBlock,
  onBlockSending,
  disabled = false,
}: {
  client: Client;
  isDarkMode: boolean;
  theme: any;
  serverUrl: string;
  adminToken: string;
  onBlock: (client: Client) => void;
  onBlockSending: (client: Client) => void;
  disabled?: boolean;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(client.name || client.platform);

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
      setName(client.name || client.platform);
      setIsEditing(false);
    }
  };

  return (
    <div
      className={`group relative p-3 rounded-2xl border transition-all duration-300 ${theme.deviceItemBg} ${theme.border} hover:border-blue-500/30`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Smaller Icon Container */}
          <div className="relative">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-inner ${theme.iconBg} ${theme.iconText}`}
            >
              <PlatformIcon platform={client.platform} size={20} />
            </div>
            {/* Smaller Status Badge */}
            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 ${isDarkMode ? "border-slate-800" : "border-white"} ${
              client.blocked ? "bg-red-500" : client.sendingBlocked ? "bg-amber-500" : "bg-emerald-500"
            }`}>
              {!client.blocked && (
                <div className={`absolute inset-0 rounded-full animate-ping opacity-20 ${client.sendingBlocked ? "bg-amber-400" : "bg-emerald-400"}`}></div>
              )}
            </div>
          </div>

          <div className="flex flex-col min-w-0">
            {isEditing ? (
              <input
                type="text"
                value={name}
                disabled={disabled}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleUpdateName}
                onKeyDown={(e) => e.key === "Enter" && handleUpdateName()}
                className={`text-sm font-bold w-full bg-transparent border-b border-blue-500 outline-none ${theme.text}`}
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-1.5 overflow-hidden">
                <h3 className={`text-sm font-bold truncate ${theme.text}`}>
                  {client.name || client.platform}
                </h3>
                <button
                  onClick={() => !disabled && setIsEditing(true)}
                  className="opacity-0 group-hover:opacity-40 transition-opacity"
                >
                  <Pencil size={11} className={theme.text} />
                </button>
              </div>
            )}
            <div className={`flex items-center gap-1 text-[10px] font-mono opacity-50 ${theme.subText}`}>
              <Globe size={10} className="shrink-0" />
              {client.ip}
            </div>
          </div>
        </div>

        <button className={`p-1.5 rounded-full opacity-0 group-hover:opacity-40 hover:opacity-100 transition-all ${theme.text}`}>
          <MoreHorizontal size={14} />
        </button>
      </div>

      {/* More Compact Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onBlockSending(client)}
          disabled={disabled}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all active:scale-[0.97] border ${
            client.sendingBlocked
              ? "bg-amber-500/10 border-amber-500/20 text-amber-600"
              : "bg-blue-500/10 border-blue-500/10 text-blue-600"
          } ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
        >
          {client.sendingBlocked ? (
            <>Allow <ShieldCheck size={12} /></>
          ) : (
            <>Restrict <ShieldX size={12} /></>
          )}
        </button>

        <button
          onClick={() => onBlock(client)}
          disabled={disabled}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl font-bold text-[9px] uppercase tracking-wider transition-all active:scale-[0.97] border ${
            client.blocked
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600"
              : "bg-red-500/10 border-red-500/20 text-red-600"
          } ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
        >
          {client.blocked ? (
            <>Unblock <UserCheck size={12} /></>
          ) : (
            <>Block <Ban size={12} /></>
          )}
        </button>
      </div>
    </div>
  );
};


