export interface MessengerWebhookBody {
  object?: string;
  entry?: Array<{
    id: string;
    time: number;
    messaging?: Array<{
      sender?: { id: string };
      recipient?: { id: string };
      timestamp?: number;
      delivery?: unknown;
      read?: unknown;
      postback?: { payload?: string; title?: string };
      message?: {
        mid?: string;
        text?: string;
        is_echo?: boolean;
        app_id?: string | number;
      };
    }>;
  }>;
}
