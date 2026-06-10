import { render } from "@react-email/components";
import React from "react";
import { getContext } from "../context";
import MagicLinkEmail, { type MagicLinkEmailProps } from "./magic-link.email";

React;

const DEFAULT_FROM = "noreply@system.krolebord.com";

type SendEmailProps<TemplateProps> = TemplateProps & {
  to: string;
  from?: string;
};

type SendResult = { success: true; error: undefined } | { success: false; error: string };

export class EmailService {
  private readonly binding: SendEmail | null;
  private readonly sender: string;

  constructor(binding: SendEmail | undefined, sender?: string) {
    this.binding = binding ?? null;
    this.sender = sender ?? DEFAULT_FROM;
  }

  async sendMagicLinkEmail(opts: SendEmailProps<MagicLinkEmailProps>): Promise<SendResult> {
    const { to, from, ...props } = opts;

    if (!this.binding) {
      console.warn("Email binding is not configured, skipping email");
      console.warn("Email data", JSON.stringify(opts, null, 2));
      return { success: true, error: undefined };
    }

    const html = await render(<MagicLinkEmail {...props} />);

    return this.send({
      to,
      from,
      subject: "Your login link",
      html,
    });
  }

  /**
   * Send an email through the Cloudflare Email Service Worker binding.
   * @see https://developers.cloudflare.com/email-service/get-started/send-emails/
   */
  private async send(params: { to: string; from?: string; subject: string; html: string }): Promise<SendResult> {
    if (!this.binding) {
      return { success: true, error: undefined };
    }

    try {
      await this.binding.send({
        to: params.to,
        from: params.from ?? this.sender,
        subject: params.subject,
        html: params.html,
      });
      return { success: true, error: undefined };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}

const context = getContext();
export const emailService = new EmailService(context?.EMAIL, context?.CLOUDFLARE_EMAIL_SENDER);
