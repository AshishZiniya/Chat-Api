import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { MessagesModule } from './messages/messages.module';
import { ChatGateway } from './chat.gateway';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chat',
    ),
    UsersModule,
    MessagesModule,
  ],
  controllers: [AppController, AuthController],
  providers: [AppService, AuthService, ChatGateway],
})
export class AppModule {}
