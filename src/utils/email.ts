// src/utils/email.ts
import emailjs from '@emailjs/browser';

const SERVICE_ID = 'service_ngtdcpp';   
const TEMPLATE_ID = 'template_704x3zs'; 
const PUBLIC_KEY = '322sX5mNVGPAblCZj';   

export async function sendPasswordResetEmail(
  toName: string,
  toEmail: string,
  resetLink: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      {
        to_name: toName,
        to_email: toEmail,
        reset_link: resetLink,
      },
      PUBLIC_KEY,
    );
    return { success: true };
  } catch (err: unknown) {
    console.error('[email] Failed to send reset email:', err);
    return {
      success: false,
      error: 'Failed to send the reset email. Please try again.',
    };
  }
}