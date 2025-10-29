import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { MessagesModule } from './messages/messages.module';
import { ChatGateway } from './chat.gateway';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    MongooseModule.forRoot(
      process.env.MONGO_URI ||
        `mongodb+srv://AshishZiniya:${process.env.DB_PASS}@cluster37471.rdwqvaf.mongodb.net/Chat?appName=Cluster37471`,
      {
        serverApi: {
          version: '1',
          strict: true,
          deprecationErrors: true,
        },
      },
    ),
    UsersModule,
    MessagesModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService, ChatGateway],
})
export class AppModule {}
