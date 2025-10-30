import { Injectable, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';

@Injectable()
export class NotificationsService implements OnModuleInit {
  onModuleInit() {
    try {
      webpush.setVapidDetails(
        'mailto:admin@chatapp.com',
        process.env.VAPID_PUBLIC_KEY || 'default_public_key',
        process.env.VAPID_PRIVATE_KEY || 'default_private_key',
      );
    } catch (error) {
      console.error('Failed to set VAPID details:', error);
      throw error;
    }
  }

  async sendPushNotification(subscription: any, payload: any) {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }

  async sendMessageNotification(
    userId: string,
    senderName: string,
    message: string,
    subscription?: any,
  ) {
    const payload = {
      title: `New message from ${senderName}`,
      body: message,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data: {
        userId,
        type: 'message',
      },
    };

    if (subscription) {
      await this.sendPushNotification(subscription, payload);
    }
  }

  async sendGroupNotification(
    groupName: string,
    senderName: string,
    message: string,
    subscriptions: any[],
  ) {
    const payload = {
      title: `New message in ${groupName}`,
      body: `${senderName}: ${message}`,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data: {
        groupName,
        type: 'group_message',
      },
    };

    for (const subscription of subscriptions) {
      await this.sendPushNotification(subscription, payload);
    }
  }
}
