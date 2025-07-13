import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/Register.vue')
  },
  {
    path: '/main',
    name: 'Main',
    component: () => import('../views/Main.vue')
  },
  {
    path: '/chat/:friendQq',
    name: 'Chat',
    component: () => import('../views/Chat.vue'),
    props: true
  },
  {
    path: '/add-friend',
    name: 'AddFriend',
    component: () => import('../views/AddFriend.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router 