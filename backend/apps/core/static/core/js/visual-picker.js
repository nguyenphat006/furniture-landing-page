// Ô chọn có hình (core/widgets.py): chọn xong cập nhật dòng đang chọn và đóng; bấm ra ngoài hoặc Esc
// thì đóng. Gắn một lần ở document nên chạy cả với dòng mới thêm trong InlinePanel.
(() => {
  const close = (picker, focus) => {
    if (!picker || !picker.open) return;
    picker.open = false;
    if (focus) picker.querySelector("summary").focus();
  };

  document.addEventListener("change", (e) => {
    const input = e.target;
    const picker = input.closest && input.closest("[data-visual-picker]");
    if (!picker || input.type !== "radio") return;
    const option = input.closest("label");
    picker.querySelector("[data-picker-visual]").innerHTML =
      option.querySelector(".visual-picker__visual").innerHTML;
    picker.querySelector("[data-picker-label]").textContent =
      option.querySelector(".visual-picker__label").textContent;
  });

  // Bấm chuột vào một lựa chọn thì đóng; bàn phím duyệt bằng mũi tên, Enter / Esc để đóng
  document.addEventListener("click", (e) => {
    const option = e.target.closest && e.target.closest(".visual-picker__option");
    if (option && e.detail > 0) {
      const picker = option.closest("[data-visual-picker]");
      requestAnimationFrame(() => close(picker, true));
      return;
    }
    document.querySelectorAll("[data-visual-picker][open]").forEach((picker) => {
      if (!picker.contains(e.target)) close(picker, false);
    });
  });

  document.addEventListener("keydown", (e) => {
    const picker = e.target.closest && e.target.closest("[data-visual-picker][open]");
    if (!picker) return;
    if (e.key === "Escape" || (e.key === "Enter" && e.target.type === "radio")) {
      e.preventDefault();
      close(picker, true);
    }
  });

  // Mở thì đưa focus vào lựa chọn đang chọn để dùng mũi tên ngay
  document.addEventListener(
    "toggle",
    (e) => {
      const picker = e.target;
      if (!picker.matches || !picker.matches("[data-visual-picker]") || !picker.open) return;
      const checked = picker.querySelector("input:checked") || picker.querySelector("input");
      if (!checked) return;
      checked.focus({ preventScroll: true });
      checked.closest("label").scrollIntoView({ block: "nearest" });
    },
    true,
  );
})();
