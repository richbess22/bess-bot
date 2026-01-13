// file-storage.js (updated for MongoDB)
const mongoose = require('mongoose');
const {
  saveSessionToMongo,
  loadSessionFromMongo,
  deleteSessionFromMongo,
  saveUserSettingsToMongo,
  loadUserSettingsFromMongo,
  getAllSessions,
  updateSessionActivity
} = require('./mongodb-config');

class MongoStorageAPI {
  constructor() {
    console.log('📁 Using MongoDB Storage API');
  }

  async saveSettings(number, settings = {}) {
    try {
      const defaultSettings = {
        autoswview: true,
        autoswlike: true,
        autoread: true,
        online: true,
        worktype: 'public',
        welcomeMessage: "Welcome to SILA MD MINI Bot!",
        autoJoinGroup: true,
        autoFollowChannel: true,
        ...settings
      };

      await saveUserSettingsToMongo(number, defaultSettings);
      return defaultSettings;
    } catch (error) {
      console.error(`❌ Error saving settings for ${number}:`, error);
      return this.getDefaultSettings();
    }
  }

  async getSettings(number) {
    try {
      const settings = await loadUserSettingsFromMongo(number);
      return settings;
    } catch (error) {
      console.error(`❌ Error getting settings for ${number}:`, error);
      return this.getDefaultSettings();
    }
  }

  async upsertSession(userId, sessionId) {
    try {
      const number = userId.split('@')[0];
      await saveSessionToMongo(number, {
        sessionId: sessionId,
        sessionData: { userId, sessionId },
        settings: await this.getSettings(number)
      });
      console.log(`✅ Session upserted in MongoDB for: ${number}`);
      return true;
    } catch (error) {
      console.error(`❌ Error upserting session for ${userId}:`, error);
      return false;
    }
  }

  async findSession(number) {
    try {
      const session = await loadSessionFromMongo(number);
      return session;
    } catch (error) {
      console.error(`❌ Error finding session for ${number}:`, error);
      return null;
    }
  }

  async findSessions() {
    try {
      const sessions = await getAllSessions();
      return sessions.map(session => ({
        number: session.number,
        sessionId: session.sessionId
      }));
    } catch (error) {
      console.error('❌ Error finding sessions:', error);
      return [];
    }
  }

  async deleteSession(number) {
    try {
      await deleteSessionFromMongo(number);
      console.log(`🗑️ Session deleted from MongoDB for: ${number}`);
      return true;
    } catch (error) {
      console.error(`❌ Error deleting session for ${number}:`, error);
      return false;
    }
  }

  getDefaultSettings() {
    return {
      autoswview: true,
      autoswlike: true,
      autoread: true,
      online: true,
      worktype: 'public',
      welcomeMessage: "Welcome to SILA MD MINI Bot!",
      autoJoinGroup: true,
      autoFollowChannel: true
    };
  }

  async updateActivity(number) {
    try {
      await updateSessionActivity(number);
      return true;
    } catch (error) {
      console.error(`❌ Error updating activity for ${number}:`, error);
      return false;
    }
  }
}

module.exports = new MongoStorageAPI();
