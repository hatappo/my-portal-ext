import { browser } from 'wxt/browser';
import { setupCommentBackground } from '../comments/background';
import { defineBackground } from 'wxt/utils/define-background';
export default defineBackground(() => {
  setupCommentBackground();
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    console.warn('SIDE_PANEL_UNAVAILABLE');
  });
});
