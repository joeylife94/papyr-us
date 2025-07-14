import { Pool } from "pg";

// PostgreSQL 연결
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://papyrus_user:papyrus_password_2024@localhost:5432/papyrus_db",
});

async function createCommentsTable() {
  try {
    console.log("🚀 Comments 테이블 생성 시작...");

    // Check if comments table exists
    const checkTableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'comments'
      );
    `;
    
    const checkResult = await pool.query(checkTableQuery);
    const tableExists = checkResult.rows[0].exists;
    
    if (tableExists) {
      console.log("✅ Comments 테이블이 이미 존재합니다.");
      return;
    }

    // Create comments table
    const createTableQuery = `
      CREATE TABLE comments (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        author TEXT NOT NULL,
        page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
        parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;

    await pool.query(createTableQuery);
    console.log("✅ Comments 테이블 생성 완료!");

    // Create indexes for better performance
    const createIndexQueries = [
      "CREATE INDEX idx_comments_page_id ON comments(page_id);",
      "CREATE INDEX idx_comments_parent_id ON comments(parent_id);",
      "CREATE INDEX idx_comments_created_at ON comments(created_at);"
    ];

    for (const query of createIndexQueries) {
      await pool.query(query);
    }
    console.log("✅ Comments 테이블 인덱스 생성 완료!");

    // Insert some test comments
    const testComments = [
      {
        content: "첫 번째 댓글입니다! 댓글 시스템이 잘 작동하네요 👍",
        author: "바이브코딩 개발자",
        page_id: 2, // API Reference Guide 페이지
        parent_id: null
      },
      {
        content: "정말 유용한 가이드네요. 특히 API 예시 부분이 도움이 많이 됐습니다.",
        author: "스터디 멤버A", 
        page_id: 2,
        parent_id: null
      },
      {
        content: "맞습니다! 저도 많이 배웠어요. 감사합니다 😊",
        author: "스터디 멤버B",
        page_id: 2,
        parent_id: 2 // Reply to the second comment
      }
    ];

    for (const comment of testComments) {
      const insertQuery = `
        INSERT INTO comments (content, author, page_id, parent_id)
        VALUES ($1, $2, $3, $4)
      `;
      await pool.query(insertQuery, [comment.content, comment.author, comment.page_id, comment.parent_id]);
    }
    
    console.log("✅ 테스트 댓글 데이터 추가 완료!");
    
    // Show final results
    const countQuery = "SELECT COUNT(*) as total FROM comments";
    const countResult = await pool.query(countQuery);
    console.log(`\n📊 총 댓글 개수: ${countResult.rows[0].total}개`);

  } catch (error) {
    console.error("❌ Comments 테이블 생성 실패:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// 스크립트 실행
createCommentsTable(); 