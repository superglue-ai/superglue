"use client";

import React from "react";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Checkbox } from "@/src/components/ui/checkbox";
import { useToast } from "@/src/hooks/use-toast";
import { useConfig } from "@/src/app/config-context";
import {
  createEESuperglueClient,
  NotificationSettingsResponse,
} from "@/src/lib/ee-superglue-client";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  Loader2,
  Pencil,
  Plus,
  Send,
  Slack,
  Trash2,
} from "lucide-react";
import { NotificationRule, RequestSource } from "@superglue/shared";

const REQUEST_SOURCE_OPTIONS = [
  { value: RequestSource.SCHEDULER, label: "Scheduler" },
  { value: RequestSource.API, label: "API" },
  { value: RequestSource.WEBHOOK, label: "Webhook" },
];

function generateRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Generate human-readable description from rule conditions
function getRuleDescription(rule: NotificationRule): string {
  const parts: string[] = [];

  // Base
  parts.push("Notify on failed runs");

  // Tool pattern
  if (rule.conditions.toolIdPattern) {
    parts.push(`with tool ID matching "${rule.conditions.toolIdPattern}"`);
  }

  // Sources - show if specific sources are selected (not undefined/empty which means all)
  const sources = rule.conditions.requestSources;
  if (sources && sources.length > 0) {
    const sourceLabels = sources.map((s) => {
      if (s === RequestSource.SCHEDULER) return "Scheduler";
      if (s === RequestSource.API) return "API";
      if (s === RequestSource.WEBHOOK) return "Webhook";
      return s;
    });
    if (sourceLabels.length === 1) {
      parts.push(`triggered by ${sourceLabels[0]}`);
    } else if (sourceLabels.length === 2) {
      parts.push(`triggered by ${sourceLabels[0]} or ${sourceLabels[1]}`);
    } else {
      parts.push(
        `triggered by ${sourceLabels.slice(0, -1).join(", ")} or ${sourceLabels[sourceLabels.length - 1]}`,
      );
    }
  }

  return parts.join(" ");
}

type SetupStep = "auth" | "test" | "rules";

export function NotificationsView() {
  const { toast } = useToast();
  const config = useConfig();

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [testSucceeded, setTestSucceeded] = React.useState(false);
  const [settings, setSettings] = React.useState<NotificationSettingsResponse | null>(null);

  // Setup wizard state
  const [isSettingUp, setIsSettingUp] = React.useState(false);
  const [setupStep, setSetupStep] = React.useState<SetupStep>("auth");

  // Configure view state (inline expansion)
  const [isConfiguring, setIsConfiguring] = React.useState(false);
  const [isEditingAuth, setIsEditingAuth] = React.useState(false);

  // Form state
  const [authType, setAuthType] = React.useState<"webhook" | "bot_token" | null>(null);
  const [webhookUrl, setWebhookUrl] = React.useState("");
  const [botToken, setBotToken] = React.useState("");
  const [channelId, setChannelId] = React.useState("");
  const [rules, setRules] = React.useState<NotificationRule[]>([]);

  // Help expansion state
  const [showWebhookHelp, setShowWebhookHelp] = React.useState(false);
  const [showBotTokenHelp, setShowBotTokenHelp] = React.useState(false);

  // Load settings on mount
  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        const client = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);
        const data = await client.getNotificationSettings();
        setSettings(data);

        // Populate form state from slack channel
        const slack = data.channels.slack;
        if (slack) {
          setAuthType(slack.authType === "bot_token" ? "bot_token" : "webhook");
          setWebhookUrl(slack.webhookUrl || "");
          setChannelId(slack.channelId || "");
          setRules(slack.rules || []);
        }
      } catch (error) {
        console.error("Failed to load notification settings:", error);
      } finally {
        setLoading(false);
      }
    };

    loadSettings();
  }, [config.superglueEndpoint, config.apiEndpoint]);

  const isSlackConfigured = settings?.channels.slack?.isConfigured ?? false;

  const handleSave = async () => {
    setSaving(true);
    try {
      const client = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);

      const slackConfig: any = { authType, rules };
      if (authType === "webhook" && webhookUrl) {
        slackConfig.webhookUrl = webhookUrl;
      } else if (authType === "bot_token") {
        if (botToken) slackConfig.botToken = botToken;
        if (channelId) slackConfig.channelId = channelId;
      }

      const data = await client.updateNotificationSettings({
        channels: {
          slack: slackConfig,
        },
      });

      setSettings(data);
      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      // Save first to ensure config is persisted
      const saved = await handleSave();
      if (!saved) {
        setTesting(false);
        return false;
      }

      const client = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);
      // Pass the current origin as baseUrl for the test message buttons
      const baseUrl = typeof window !== "undefined" ? window.location.origin : undefined;
      const result = await client.testNotification("slack", baseUrl);

      if (result.success) {
        toast({
          title: "Test successful",
          description: "A test notification was sent to Slack.",
        });
        setTestSucceeded(true);
        // Refresh settings to get updated status
        const data = await client.getNotificationSettings();
        setSettings(data);
        return true;
      } else {
        toast({
          title: "Test failed",
          description: result.error || "Failed to send test notification",
          variant: "destructive",
        });
        return false;
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to send test notification",
        variant: "destructive",
      });
      return false;
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const client = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);
      await client.deleteNotificationChannel("slack");
      const data = await client.getNotificationSettings();
      setSettings(data);
      setWebhookUrl("");
      setBotToken("");
      setChannelId("");
      setAuthType(null);
      setRules([]);
      setIsConfiguring(false);
      toast({
        title: "Removed",
        description: "Slack notifications have been removed.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to disconnect",
        variant: "destructive",
      });
    }
  };

  const startSetup = () => {
    setIsSettingUp(true);
    setSetupStep("auth");
    setTestSucceeded(false);
    setAuthType(null);
  };

  const cancelSetup = () => {
    setIsSettingUp(false);
    setSetupStep("auth");
    setTestSucceeded(false);
    // Reset form to saved values
    const slack = settings?.channels.slack;
    if (slack) {
      setAuthType(slack.authType === "bot_token" ? "bot_token" : "webhook");
      setWebhookUrl(slack.webhookUrl || "");
      setChannelId(slack.channelId || "");
    } else {
      setAuthType(null);
    }
  };

  const handleNextStep = async () => {
    if (setupStep === "auth") {
      setSetupStep("test");
    } else if (setupStep === "test") {
      setSetupStep("rules");
    } else if (setupStep === "rules") {
      const saved = await handleSave();
      if (saved) {
        setIsSettingUp(false);
      }
    }
  };

  const handlePrevStep = () => {
    if (setupStep === "test") {
      setSetupStep("auth");
    } else if (setupStep === "rules") {
      setSetupStep("test");
    }
  };

  const addRule = (preset?: "scheduler" | "custom") => {
    const allSources = [RequestSource.SCHEDULER, RequestSource.API, RequestSource.WEBHOOK];
    const newRule: NotificationRule = {
      id: generateRuleId(),
      enabled: true,
      conditions: {
        status: "failed",
        requestSources: preset === "scheduler" ? [RequestSource.SCHEDULER] : allSources,
      },
    };
    setRules([...rules, newRule]);
  };

  const addToolPatternRule = (pattern: string) => {
    const newRule: NotificationRule = {
      id: generateRuleId(),
      enabled: true,
      conditions: {
        status: "failed",
        toolIdPattern: pattern,
      },
    };
    setRules([...rules, newRule]);
  };

  const updateRule = (id: string, updates: Partial<NotificationRule>) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const deleteRule = async (id: string) => {
    const newRules = rules.filter((r) => r.id !== id);
    setRules(newRules);

    // Save immediately
    try {
      const client = createEESuperglueClient(config.superglueEndpoint, config.apiEndpoint);
      await client.updateNotificationSettings({
        channels: {
          slack: {
            rules: newRules,
          },
        },
      });
    } catch (error: any) {
      // Revert on error
      setRules(rules);
      toast({
        title: "Error",
        description: error.message || "Failed to delete rule",
        variant: "destructive",
      });
    }
  };

  const canProceedFromAuth =
    (authType === "webhook" && webhookUrl.includes("hooks.slack.com/")) ||
    (authType === "bot_token" && botToken.startsWith("xoxb-") && channelId);

  const canFinishSetup = rules.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Setup Wizard View
  if (isSettingUp) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-12">
        {/* Header with back button */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={cancelSetup}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <div className="w-10 h-10 rounded-lg bg-[#4A154B] flex items-center justify-center">
            <Slack className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Set up Slack Notifications</h1>
            <p className="text-sm text-muted-foreground">
              {setupStep === "auth" && "Step 1 of 3: Connect to Slack"}
              {setupStep === "test" && "Step 2 of 3: Test connection"}
              {setupStep === "rules" && "Step 3 of 3: Configure rules"}
            </p>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2">
          {["auth", "test", "rules"].map((step, index) => (
            <React.Fragment key={step}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === setupStep
                    ? "bg-primary text-primary-foreground"
                    : (step === "auth" && (setupStep === "test" || setupStep === "rules")) ||
                        (step === "test" && setupStep === "rules")
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {(step === "auth" && (setupStep === "test" || setupStep === "rules")) ||
                (step === "test" && setupStep === "rules") ? (
                  <Check className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
              {index < 2 && (
                <div
                  className={`flex-1 h-0.5 ${
                    (step === "auth" && (setupStep === "test" || setupStep === "rules")) ||
                    (step === "test" && setupStep === "rules")
                      ? "bg-foreground"
                      : "bg-muted"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="pt-6">
            {/* Step 1: Authentication */}
            {setupStep === "auth" && (
              <div className="space-y-6">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    To send automated Slack messages, Superglue needs to be connected to your
                    workspace. This requires a Slack Workspace Admin to set up.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label className="text-base">Choose authentication method</Label>

                  {/* Webhook option */}
                  <div
                    onClick={() => setAuthType("webhook")}
                    className={`rounded-lg border transition-all cursor-pointer ${
                      authType === "webhook"
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          authType === "webhook" ? "border-primary" : "border-muted-foreground/50"
                        }`}
                      >
                        {authType === "webhook" && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">Incoming Webhook</div>
                        <div className="text-xs text-muted-foreground">
                          Simpler setup, single channel
                        </div>
                      </div>
                    </div>

                    {authType === "webhook" && (
                      <div className="px-3 pb-3 pt-1 border-t space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="webhookUrl" className="text-sm">
                            Webhook URL
                          </Label>
                          <Input
                            id="webhookUrl"
                            type="url"
                            placeholder="https://hooks.slack.com/services/..."
                            value={webhookUrl}
                            onChange={(e) => setWebhookUrl(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          {webhookUrl && !webhookUrl.includes("hooks.slack.com/") && (
                            <p className="text-xs text-destructive">
                              This doesn&apos;t look like a valid Slack webhook URL. It should start
                              with https://hooks.slack.com/
                            </p>
                          )}
                        </div>

                        {/* Collapsible help */}
                        <div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowWebhookHelp(!showWebhookHelp);
                            }}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                            <span>How do I get a webhook URL?</span>
                            {showWebhookHelp ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>

                          {showWebhookHelp && (
                            <div
                              className="mt-2 bg-muted/50 rounded-lg p-3 text-xs space-y-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                                <li>
                                  Go to{" "}
                                  <a
                                    href="https://api.slack.com/apps"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                  >
                                    api.slack.com/apps
                                  </a>
                                </li>
                                <li>
                                  Click <strong>Create New App</strong>
                                </li>
                                <li>
                                  Select <strong>From scratch</strong>
                                </li>
                                <li>
                                  Enter a name (e.g., &quot;SuperglueNotifications&quot;) and select
                                  your workspace
                                </li>
                                <li>
                                  In the left menu under <strong>Features</strong>, click{" "}
                                  <strong>Incoming Webhooks</strong>
                                </li>
                                <li>
                                  Toggle <strong>Activate Incoming Webhooks</strong> to On
                                </li>
                                <li>
                                  Click <strong>Add New Webhook to Workspace</strong> and select a
                                  channel
                                </li>
                                <li>Copy the generated Webhook URL</li>
                              </ol>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bot Token option */}
                  <div
                    onClick={() => setAuthType("bot_token")}
                    className={`rounded-lg border transition-all cursor-pointer ${
                      authType === "bot_token"
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          authType === "bot_token" ? "border-primary" : "border-muted-foreground/50"
                        }`}
                      >
                        {authType === "bot_token" && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">Bot Token</div>
                        <div className="text-xs text-muted-foreground">
                          More flexible, any channel
                        </div>
                      </div>
                    </div>

                    {authType === "bot_token" && (
                      <div className="px-3 pb-3 pt-1 border-t space-y-3">
                        <div className="space-y-2">
                          <Label htmlFor="botToken" className="text-sm">
                            Bot Token
                          </Label>
                          <Input
                            id="botToken"
                            type="password"
                            placeholder="xoxb-..."
                            value={botToken}
                            onChange={(e) => setBotToken(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="channelId" className="text-sm">
                            Channel ID
                          </Label>
                          <Input
                            id="channelId"
                            placeholder="C0123456789"
                            value={channelId}
                            onChange={(e) => setChannelId(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <p className="text-xs text-muted-foreground">
                            Right-click a channel → View channel details → Copy Channel ID
                          </p>
                        </div>

                        {/* Collapsible help */}
                        <div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowBotTokenHelp(!showBotTokenHelp);
                            }}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <HelpCircle className="h-3.5 w-3.5" />
                            <span>How do I get a bot token?</span>
                            {showBotTokenHelp ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>

                          {showBotTokenHelp && (
                            <div
                              className="mt-2 bg-muted/50 rounded-lg p-3 text-xs space-y-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                                <li>
                                  Go to{" "}
                                  <a
                                    href="https://api.slack.com/apps"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline"
                                  >
                                    api.slack.com/apps
                                  </a>
                                </li>
                                <li>
                                  Click <strong>Create New App</strong> →{" "}
                                  <strong>From scratch</strong>
                                </li>
                                <li>
                                  Go to <strong>OAuth & Permissions</strong> in the left menu
                                </li>
                                <li>
                                  Under <strong>Scopes</strong>, add{" "}
                                  <code className="bg-muted px-1 rounded">chat:write</code>
                                </li>
                                <li>
                                  Click <strong>Install to Workspace</strong>
                                </li>
                                <li>
                                  Copy the <strong>Bot User OAuth Token</strong>
                                </li>
                              </ol>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Test */}
            {setupStep === "test" && (
              <div className="space-y-6 text-center py-6">
                {testSucceeded ? (
                  <>
                    <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium">Connection successful!</h3>
                      <p className="text-muted-foreground mt-1">
                        Your Slack integration is working correctly.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                      <Send className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium">Test your connection</h3>
                      <p className="text-muted-foreground mt-1">
                        Send a test message to verify everything works.
                      </p>
                    </div>
                    {settings?.channels.slack?.status === "failing" && (
                      <div className="bg-yellow-50 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-200 rounded-lg p-3 text-sm">
                        Previous test failed: {settings?.channels.slack?.lastError}
                      </div>
                    )}
                    <Button onClick={handleTest} disabled={testing} size="lg">
                      {testing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      {testing ? "Sending..." : "Send Test Message"}
                    </Button>
                  </>
                )}
              </div>
            )}

            {/* Step 3: Rules */}
            {setupStep === "rules" && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium">When should we notify you?</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose a preset or create a custom rule.
                  </p>
                </div>

                {rules.length === 0 ? (
                  <div className="space-y-2">
                    {/* Preset options */}
                    <button
                      type="button"
                      onClick={() => addRule("scheduler")}
                      className="w-full p-3 rounded-lg border text-left hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <div className="font-medium text-sm">Failed runs triggered by Scheduler</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Get notified when any scheduled job fails
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => addRule("custom")}
                      className="w-full p-3 rounded-lg border text-left hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <div className="font-medium text-sm">Failed runs for a specific tool</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Filter by tool ID pattern
                      </div>
                    </button>

                    <div className="relative py-2">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-card px-2 text-muted-foreground">or</span>
                      </div>
                    </div>

                    <Button variant="outline" className="w-full" onClick={() => addRule()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create custom rule
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {rules.map((rule) => (
                      <RuleCard
                        key={rule.id}
                        rule={rule}
                        onUpdate={(updates) => updateRule(rule.id, updates)}
                        onDelete={() => deleteRule(rule.id)}
                      />
                    ))}
                    <Button variant="outline" size="sm" onClick={() => addRule()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add another rule
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between pb-8">
          {setupStep !== "auth" ? (
            <Button variant="outline" onClick={handlePrevStep}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          ) : (
            <div />
          )}
          {setupStep === "test" && !testSucceeded ? (
            <Button variant="ghost" onClick={handleNextStep}>
              Skip
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleNextStep}
              disabled={
                (setupStep === "auth" && !canProceedFromAuth) ||
                (setupStep === "rules" && (!canFinishSetup || saving))
              }
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {setupStep === "auth" && "Next"}
              {setupStep === "test" && "Next"}
              {setupStep === "rules" && (saving ? "Saving..." : "Finish Setup")}
              {setupStep !== "rules" && <ArrowRight className="h-4 w-4 ml-2" />}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Main View (configured or not)
  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-muted-foreground mt-1">Configure alerts for failed tool runs.</p>
      </div>

      {/* Warning banner for failing notifications */}
      {settings?.channels.slack?.status === "disabled" && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <span className="text-sm text-red-800 dark:text-red-200 flex-1">
              Slack notifications disabled
              {settings.channels.slack.lastError && (
                <span className="text-red-600 dark:text-red-400">
                  {" "}
                  — {settings.channels.slack.lastError}
                </span>
              )}
            </span>
            <Button variant="outline" size="sm" onClick={startSetup} className="h-7 text-xs">
              Fix
            </Button>
          </div>
        </div>
      )}

      {/* Slack Integration Card */}
      <Card
        className={isSlackConfigured ? "cursor-pointer" : ""}
        onClick={() => isSlackConfigured && setIsConfiguring(!isConfiguring)}
      >
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#4A154B] flex items-center justify-center">
                <Slack className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">Slack</CardTitle>
                <CardDescription>
                  {isSlackConfigured ? "Connected" : "Not configured"}
                </CardDescription>
              </div>
            </div>
            {isSlackConfigured ? (
              <div className="flex items-center gap-2">
                {isConfiguring ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            ) : (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  startSetup();
                }}
              >
                Set Up
              </Button>
            )}
          </div>
        </CardHeader>

        {/* Collapsed: Show rules summary */}
        {isSlackConfigured && !isConfiguring && (
          <CardContent className="border-t pt-3 pb-3 space-y-3">
            {/* Error indicator in collapsed view */}
            {(settings?.channels.slack?.status === "failing" ||
              settings?.channels.slack?.status === "disabled") && (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>
                  {settings.channels.slack.status === "disabled"
                    ? "Notifications disabled due to repeated failures"
                    : "Last notification failed"}
                  {settings.channels.slack.lastError && (
                    <span className="text-muted-foreground">
                      {" "}
                      — {settings.channels.slack.lastError}
                    </span>
                  )}
                </span>
              </div>
            )}
            {rules.length > 0 ? (
              <ul className="space-y-1">
                {rules.slice(0, 3).map((rule) => (
                  <li
                    key={rule.id}
                    className="text-sm text-muted-foreground flex items-center gap-2"
                  >
                    <span className="text-muted-foreground/50">•</span>
                    {getRuleDescription(rule)}
                  </li>
                ))}
                {rules.length > 3 && (
                  <li className="text-xs text-muted-foreground">+{rules.length - 3} more</li>
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No notification rules configured</p>
            )}
          </CardContent>
        )}

        {/* Expanded Configure View */}
        {isSlackConfigured && isConfiguring && (
          <CardContent className="border-t pt-4 space-y-6" onClick={(e) => e.stopPropagation()}>
            {/* Auth Section */}
            <div className="space-y-4">
              {isEditingAuth ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Authentication</h3>
                  </div>

                  {/* Auth type selection */}
                  <div className="space-y-2">
                    <div
                      onClick={() => setAuthType("webhook")}
                      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                        authType === "webhook"
                          ? "border-primary bg-background"
                          : "border-transparent hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
                            authType === "webhook" ? "border-primary" : "border-muted-foreground/50"
                          }`}
                        >
                          {authType === "webhook" && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                        </div>
                        <span className="text-sm font-medium">Incoming Webhook</span>
                      </div>
                    </div>

                    <div
                      onClick={() => setAuthType("bot_token")}
                      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                        authType === "bot_token"
                          ? "border-primary bg-background"
                          : "border-transparent hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
                            authType === "bot_token"
                              ? "border-primary"
                              : "border-muted-foreground/50"
                          }`}
                        >
                          {authType === "bot_token" && (
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          )}
                        </div>
                        <span className="text-sm font-medium">Bot Token</span>
                      </div>
                    </div>
                  </div>

                  {/* Webhook URL input */}
                  {authType === "webhook" && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="webhookUrlEdit" className="text-xs">
                          Webhook URL
                        </Label>
                        <Input
                          id="webhookUrlEdit"
                          type="url"
                          placeholder="https://hooks.slack.com/services/..."
                          value={webhookUrl}
                          onChange={(e) => setWebhookUrl(e.target.value)}
                        />
                        {webhookUrl && !webhookUrl.includes("hooks.slack.com/") && (
                          <p className="text-xs text-destructive">
                            This doesn&apos;t look like a valid Slack webhook URL
                          </p>
                        )}
                      </div>

                      {/* Collapsible help */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowWebhookHelp(!showWebhookHelp)}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                          <span>How do I get a webhook URL?</span>
                          {showWebhookHelp ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>

                        {showWebhookHelp && (
                          <div className="mt-2 bg-muted/50 rounded-lg p-3 text-xs space-y-2">
                            <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                              <li>
                                Go to{" "}
                                <a
                                  href="https://api.slack.com/apps"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  api.slack.com/apps
                                </a>
                              </li>
                              <li>
                                Click <strong>Create New App</strong>
                              </li>
                              <li>
                                Select <strong>From scratch</strong>
                              </li>
                              <li>
                                Enter a name (e.g., &quot;SuperglueNotifications&quot;) and select
                                your workspace
                              </li>
                              <li>
                                In the left menu under <strong>Features</strong>, click{" "}
                                <strong>Incoming Webhooks</strong>
                              </li>
                              <li>
                                Toggle <strong>Activate Incoming Webhooks</strong> to On
                              </li>
                              <li>
                                Click <strong>Add New Webhook to Workspace</strong> and select a
                                channel
                              </li>
                              <li>Copy the generated Webhook URL</li>
                            </ol>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bot token inputs */}
                  {authType === "bot_token" && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="botTokenEdit" className="text-xs">
                          Bot Token
                        </Label>
                        <Input
                          id="botTokenEdit"
                          type="password"
                          placeholder="xoxb-..."
                          value={botToken}
                          onChange={(e) => setBotToken(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="channelIdEdit" className="text-xs">
                          Channel ID
                        </Label>
                        <Input
                          id="channelIdEdit"
                          placeholder="C0123456789"
                          value={channelId}
                          onChange={(e) => setChannelId(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Right-click a channel → View channel details → Copy Channel ID
                        </p>
                      </div>

                      {/* Collapsible help */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowBotTokenHelp(!showBotTokenHelp)}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                          <span>How do I get a bot token?</span>
                          {showBotTokenHelp ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>

                        {showBotTokenHelp && (
                          <div className="mt-2 bg-muted/50 rounded-lg p-3 text-xs space-y-2">
                            <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                              <li>
                                Go to{" "}
                                <a
                                  href="https://api.slack.com/apps"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline"
                                >
                                  api.slack.com/apps
                                </a>
                              </li>
                              <li>
                                Click <strong>Create New App</strong> →{" "}
                                <strong>From scratch</strong>
                              </li>
                              <li>
                                Go to <strong>OAuth & Permissions</strong> in the left menu
                              </li>
                              <li>
                                Under <strong>Scopes</strong>, add{" "}
                                <code className="bg-muted px-1 rounded">chat:write</code>
                              </li>
                              <li>
                                Click <strong>Install to Workspace</strong>
                              </li>
                              <li>
                                Copy the <strong>Bot User OAuth Token</strong>
                              </li>
                            </ol>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const saved = await handleSave();
                        if (saved) {
                          await handleTest();
                        }
                      }}
                      disabled={saving || testing || !canProceedFromAuth}
                    >
                      {testing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Test Connection
                    </Button>
                    <Button variant="ghost" onClick={() => setIsEditingAuth(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={async () => {
                        await handleSave();
                        setIsEditingAuth(false);
                      }}
                      disabled={saving || !canProceedFromAuth}
                    >
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="font-medium">Authentication</h3>
                  {/* Error indicator in auth section */}
                  {(settings?.channels.slack?.status === "failing" ||
                    settings?.channels.slack?.status === "disabled") && (
                    <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <span className="font-medium text-amber-800 dark:text-amber-200">
                          {settings.channels.slack.status === "disabled"
                            ? "Notifications disabled"
                            : "Connection issue"}
                        </span>
                        {settings.channels.slack.lastError && (
                          <p className="text-amber-700 dark:text-amber-300 mt-0.5">
                            {settings.channels.slack.lastError}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="text-sm">
                    <span className="text-muted-foreground">Method: </span>
                    <span className="font-medium">
                      {settings?.channels.slack?.authType === "bot_token"
                        ? "Bot Token"
                        : "Incoming Webhook"}
                    </span>
                    {settings?.channels.slack?.channelId && (
                      <>
                        <span className="text-muted-foreground ml-4">Channel: </span>
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {settings.channels.slack?.channelId}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Ensure authType is set from current settings
                        if (settings?.channels.slack?.authType) {
                          setAuthType(
                            settings.channels.slack.authType === "bot_token"
                              ? "bot_token"
                              : "webhook",
                          );
                        }
                        setIsEditingAuth(true);
                      }}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                      {testing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Test Connection
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Rules Section - hide when editing auth */}
            {!isEditingAuth && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Notification Rules</h3>
                  <Button variant="outline" size="sm" onClick={() => addRule()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Rule
                  </Button>
                </div>

                {rules.length === 0 ? (
                  <div className="border-2 border-dashed rounded-lg p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      No rules configured. Add a rule to start receiving notifications.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {rules.map((rule) => (
                      <RuleCard
                        key={rule.id}
                        rule={rule}
                        onUpdate={(updates) => updateRule(rule.id, updates)}
                        onDelete={() => deleteRule(rule.id)}
                        defaultExpanded={false}
                      />
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnect}
                    className="text-muted-foreground"
                  >
                    Remove
                  </Button>
                  {rules.length > 0 && (
                    <Button onClick={handleSave} disabled={saving}>
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save Changes
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// Simple Rule Card Component
function RuleCard({
  rule,
  onUpdate,
  onDelete,
  defaultExpanded = true,
}: {
  rule: NotificationRule;
  onUpdate: (updates: Partial<NotificationRule>) => void;
  onDelete: () => void;
  defaultExpanded?: boolean;
}) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const description = getRuleDescription(rule);

  return (
    <div className="border rounded-lg">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm">{description}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium">Tool ID Pattern</Label>
            <Input
              value={rule.conditions.toolIdPattern || ""}
              onChange={(e) =>
                onUpdate({
                  conditions: {
                    ...rule.conditions,
                    toolIdPattern: e.target.value || undefined,
                  },
                })
              }
              placeholder="e.g., prod-*, *-sync (leave empty for all tools)"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">Trigger Sources</Label>
            <div className="flex flex-wrap gap-3">
              {REQUEST_SOURCE_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={
                      !rule.conditions.requestSources ||
                      rule.conditions.requestSources.includes(option.value as RequestSource)
                    }
                    onCheckedChange={(checked) => {
                      const allSources = REQUEST_SOURCE_OPTIONS.map(
                        (o) => o.value as RequestSource,
                      );
                      const currentSources = rule.conditions.requestSources || allSources;
                      const newSources = checked
                        ? [...currentSources, option.value as RequestSource]
                        : currentSources.filter((s) => s !== option.value);
                      onUpdate({
                        conditions: {
                          ...rule.conditions,
                          requestSources:
                            newSources.length === allSources.length ? undefined : newSources,
                        },
                      });
                    }}
                  />
                  <span className="text-xs">{option.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
