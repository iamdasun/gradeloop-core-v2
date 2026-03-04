"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export function AIAssistantPanel() {
  const [inlineSuggestions, setInlineSuggestions] = useState(false);
  const [model, setModel] = useState("gpt-4o-mini");
  const [prompt, setPrompt] = useState("");

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3 bg-muted/30">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">AI Assistant</h3>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Inline Suggestions Toggle */}
        <div className="flex items-center justify-between">
          <Label htmlFor="inline-suggestions" className="text-sm">
            Inline Suggestions
          </Label>
          <Switch
            id="inline-suggestions"
            checked={inlineSuggestions}
            onCheckedChange={setInlineSuggestions}
          />
        </div>

        {/* Model Selection */}
        <div className="space-y-2">
          <Label className="text-sm">AI Model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
              <SelectItem value="gpt-4o">gpt-4o</SelectItem>
              <SelectItem value="claude-3-sonnet">Claude 3 Sonnet</SelectItem>
              <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Chat Input */}
        <div className="space-y-2">
          <Label className="text-sm">Ask AI</Label>
          <Textarea
            placeholder="Sign in to chat with AI assistant..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-[100px] resize-none text-sm"
            disabled
          />
          <p className="text-xs text-muted-foreground">
            AI assistant features are coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
