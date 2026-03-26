import { createRouter, createWebHashHistory } from "vue-router";

const BuilderView = () => import("../views/BuilderView.vue");
const DashboardView = () => import("../views/DashboardView.vue");

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "dashboard",
      component: DashboardView
    },
    {
      path: "/dashboard",
      redirect: { name: "dashboard" }
    },
    {
      path: "/builder",
      name: "builder",
      component: BuilderView
    }
  ]
});

export default router;
