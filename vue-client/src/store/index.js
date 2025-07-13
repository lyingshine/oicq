import { createStore } from 'vuex'

export default createStore({
  state: {
    currentUser: null,
    friends: [],
    friendRequests: [],
    messages: {},
    unreadMessages: {},
    userStatus: 'online'
  },
  getters: {
    isLoggedIn: state => !!state.currentUser,
    currentUserQq: state => state.currentUser ? state.currentUser.qq : null,
    friendRequestCount: state => state.friendRequests.length,
    getFriendById: state => qq => {
      return state.friends.find(friend => friend.qq === qq) || null
    },
    getMessages: state => (userQq, otherQq) => {
      const key = `${userQq}_${otherQq}`;
      return state.messages[key] || [];
    },
    getUnreadCount: state => friendQq => {
      return state.unreadMessages[friendQq] || 0;
    }
  },
  mutations: {
    setCurrentUser(state, user) {
      state.currentUser = user;
    },
    setFriends(state, friends) {
      state.friends = friends;
    },
    setFriendRequests(state, requests) {
      state.friendRequests = requests;
    },
    addFriendRequest(state, request) {
      state.friendRequests.push(request);
    },
    removeFriendRequest(state, requesterId) {
      state.friendRequests = state.friendRequests.filter(req => req.qq !== requesterId);
    },
    addFriend(state, friend) {
      state.friends.push(friend);
    },
    updateFriendStatus(state, { friendQq, status }) {
      const friend = state.friends.find(f => f.qq === friendQq);
      if (friend) {
        friend.status = status;
      }
    },
    setUserStatus(state, status) {
      state.userStatus = status;
    },
    addMessage(state, { userQq, otherQq, message }) {
      const key = `${userQq}_${otherQq}`;
      if (!state.messages[key]) {
        state.messages[key] = [];
      }
      state.messages[key].push(message);
    },
    incrementUnreadCount(state, friendQq) {
      if (!state.unreadMessages[friendQq]) {
        state.unreadMessages[friendQq] = 0;
      }
      state.unreadMessages[friendQq]++;
    },
    clearUnreadMessages(state, friendQq) {
      state.unreadMessages[friendQq] = 0;
    }
  },
  actions: {
    async login({ commit }, { username, password }) {
      // 这里将通过preload.js调用Electron的API
      // 实际实现将在background.js中
      return { success: true };
    },
    async register({ commit }, { nickname, password }) {
      // 同上
      return { success: true };
    },
    async getFriends({ commit, state }) {
      // 同上
      return [];
    },
    async sendFriendRequest({ commit, state }, recipientQq) {
      // 同上
      return { success: true };
    },
    async acceptFriendRequest({ commit, state }, requesterQq) {
      // 同上
      return { success: true };
    },
    async rejectFriendRequest({ commit, state }, requesterQq) {
      // 同上
      return { success: true };
    },
    async sendMessage({ commit, state }, { receiverQq, message }) {
      // 同上
      return { success: true };
    },
    async updateUserStatus({ commit, state }, status) {
      // 同上
      commit('setUserStatus', status);
      return { success: true };
    }
  },
  modules: {
  }
}) 