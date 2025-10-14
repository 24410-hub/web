// --- 데이터 키 정의 ---
const USERS_KEY = 'roguelike_users';
const HOF_KEY = 'roguelike_hall_of_fame';

// --- 사용자 관리 함수 ---

/**
 * 새로운 사용자를 등록합니다.
 * @param {string} name - 사용자 이름
 * @param {string} password - 비밀번호
 * @returns {{success: boolean, message: string}} - 성공 여부와 메시지 객체
 */
function registerUser(name, password) {
    const users = JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    
    if (users.find(user => user.name === name)) {
        return { success: false, message: '이미 존재하는 이름입니다.' };
    }

    if (name.length < 3) {
        return { success: false, message: '이름은 3자 이상이어야 합니다.' };
    }

    users.push({ name, password });
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    
    return { success: true, message: '회원가입이 완료되었습니다.' };
}

/**
 * 사용자 로그인을 처리합니다.
 * @param {string} name - 사용자 이름
 * @param {string} password - 비밀번호
 * @returns {{success: boolean, message?: string}} - 성공 여부와 메시지 객체
 */
function loginUser(name, password) {
    const users = JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    const user = users.find(u => u.name === name && u.password === password);

    if (user) {
        return { success: true };
    } else {
        return { success: false, message: '이름 또는 비밀번호가 일치하지 않습니다.' };
    }
}


// --- 명예의 전당 관리 함수 ---

/**
 * 명예의 전당에 새로운 기록을 추가합니다.
 * @param {string} characterName - 클리어한 캐릭터 이름
 * @param {string[]} items - 클리어 시 보유 아이템 목록
 * @returns {void}
 */
function addHallOfFameEntry(characterName, items) {
    const records = JSON.parse(localStorage.getItem(HOF_KEY)) || [];
    
    const newRecord = {
        characterName,
        items,
        clearedAt: new Date().toISOString()
    };

    records.push(newRecord);
    localStorage.setItem(HOF_KEY, JSON.stringify(records));
}

/**
 * 명예의 전당 모든 기록을 가져옵니다.
 * @returns {Array<Object>} - 명예의 전당 기록 배열
 */
function getHallOfFame() {
    return JSON.parse(localStorage.getItem(HOF_KEY)) || [];
}

/**
 * 명예의 전당을 위한 목업(mockup) 데이터를 초기화합니다.
 * 이 함수는 테스트용이며, 실제 게임에서는 게임 클리어 시점에 호출해야 합니다.
 */
function initializeMockData() {
    const records = getHallOfFame();
    if (records.length === 0) {
        addHallOfFameEntry('전사_알렉스', ['강철 검', '가죽 갑옷', '치유 물약']);
        // 1초 간격을 두어 시간 차이를 만듭니다.
        setTimeout(() => {
           addHallOfFameEntry('마법사_엘라', ['화염 지팡이', '로브', '마나 물약']);
        }, 1000);
         setTimeout(() => {
           addHallOfFameEntry('궁수_로빈', ['장궁', '경갑', '독화살']);
        }, 2000);
    }
}
