<template>
  <div class="projects-placeholder">
    <p class="lead">The project tree is in the sidebar.</p>
    <ul>
      <li>Right click a project to add folders, import an archive, export it, or delete it.</li>
      <li>Right click a program to open its workspace, or copy its UUID.</li>
      <li>Drop a file on a folder to import it as a binary there.</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
// The projects page holds no state: the sidebar owns the tree and the workspace panel shows files.
</script>

<style scoped>
.projects-placeholder {
  padding: 24px 28px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--akiba-chat-text-muted);
}

.lead {
  margin: 0 0 8px;
  font-size: 14px;
  color: var(--vscode-editor-foreground);
}

ul {
  margin: 0;
  padding-left: 18px;
}
</style>
