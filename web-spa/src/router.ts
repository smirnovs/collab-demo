import { createRouter, createWebHistory } from 'vue-router';
import CollaborativeEditor from './components/CollaborativeEditor.vue';
import SnapshotHistoryPage from './components/SnapshotHistoryPage.vue';

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: CollaborativeEditor },
    { path: '/history', component: SnapshotHistoryPage },
  ],
});
