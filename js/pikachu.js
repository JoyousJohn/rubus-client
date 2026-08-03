// js/pikachu.js - extracted verbatim from js/map.js
let lastPikachuGif = null;

const gifSoundMap = {
    'img/pika.gif': 'img/pika.mp3',
    'img/jolteon.gif': 'img/jolteon.mp3',
    'img/sonic.gif': 'img/sonic.mp3',
    'img/mario.gif': 'img/mario.mp3',
    'img/yoshi.gif': 'img/yoshi.mp3',
    'img/luigi.gif': 'img/luigi.mp3',
    'img/kirby.gif': 'img/kirby.mp3',
    'img/link.gif': 'img/link.mp3',
    'img/tom.gif': 'img/tom.mp3',
    'img/roadrunner.gif': 'img/roadrunner.mp3',
};

function animatePikachu() {
    const pika = document.createElement('img');
    const gifs = Object.keys(gifSoundMap);
    
    const availableGifs = gifs.filter(gif => gif !== lastPikachuGif);
    const selectedGif = availableGifs[Math.floor(Math.random() * availableGifs.length)];
    lastPikachuGif = selectedGif;
    
    // Play the corresponding sound for the selected GIF
    const sound = new Audio(gifSoundMap[selectedGif]);
    setTimeout(() => {
        sound.play();
    }, 100);
    
    pika.src = selectedGif;
    if (pika.src.includes('jolteon.gif')) {
        pika.style.transform = 'translateY(-50%) scaleX(-1)';
    } else if (pika.src.includes('sonic.gif')) {
        pika.style.transform = 'translateY(-50%) scale(0.7)';
    } else if (pika.src.includes('kirby.gif')) {
        pika.style.transform = 'translateY(-50%) scale(0.57)';
    } else if (pika.src.includes('tom.gif')) {
        pika.style.transform = 'translateY(-50%) scaleX(-1)';
    } else if (pika.src.includes('roadrunner.gif')) {
        pika.style.transform = 'translateY(-50%) scaleX(-2) scaleY(2)';
    } else {
        pika.style.transform = 'translateY(-50%)';
    }
    pika.style.position = 'fixed';
    pika.style.top = '50%';
    pika.style.left = '-100px';
    pika.style.width = '100px';
    pika.style.height = 'auto';
    pika.style.zIndex = '1000';
    document.body.appendChild(pika);

    const startTime = performance.now();
    const duration = 1800;
    const screenWidth = window.innerWidth;

    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const newPosition = -100 + (screenWidth + 200) * progress;
        pika.style.left = `${newPosition}px`;

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            pika.remove();
        }
    }

    requestAnimationFrame(animate);
}
