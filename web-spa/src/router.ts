import { createRouter, createWebHistory } from 'vue-router';
import CollaborativeEditor from './components/CollaborativeEditor.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: CollaborativeEditor }]
});
