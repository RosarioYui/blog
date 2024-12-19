

document.addEventListener("DOMContentLoaded", () => {
    const searchMenuBtn = document.getElementById("searchMenuBtn");
    const searchBox = document.querySelector(".search-box");

    // 点击导航中的搜索按钮打开模态窗口
    searchMenuBtn.addEventListener("click", (e) => {
        e.preventDefault(); // 阻止默认行为
        searchBox.classList.add("active");
    });

    // 点击背景关闭模态窗口
    // modalOverlay.addEventListener("click", (e) => {
    //     if (e.target === modalOverlay) {
    //         modalOverlay.classList.remove("active");
    //     }
    // });

    docsearch({
        appId: "XE91G8QVL5",
        apiKey: "58307dcd232fecb825c755151a52d2cc",
        indexName: "rosarioyuiio",
        container: "#searchMenuBtn",
        debug: false
    });
    
});