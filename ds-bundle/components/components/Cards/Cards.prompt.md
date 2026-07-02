# Cards & Layout — HSK Prep

```html
<div class="card-grid">                     <!-- responsive auto-fill grid, minmax(260px,1fr) -->
  <a class="content-card" href="...">      <!-- surface card, hover lift + accent border -->
    <h3 style="font-size:var(--fs-lg)">Title</h3>
    <p style="font-size:var(--fs-sm);color:var(--stone)">Description</p>
  </a>
</div>
```

- `.content-card` — the workhorse card (works as `<a>` or `<div>`).
- `.stats-row` + `.stat` (`.stat-num`, `.stat-label`) — centered stat strip for public pages.
- Inside the app shell use `.dash-stats` + `.dash-stat-card` (`.dash-stat-num`, `.dash-stat-label`) instead.
- `.breadcrumb` — `<nav class="breadcrumb"><a>…</a> › Current</nav>`.
- `.section-title` — uppercase section label between content blocks.
- Tables: always wrap in `<div class="table-wrap"><table>…</table></div>` (mobile scroll).
- Loading state: `<div class="spinner"></div>` inside a `.loading` block.
