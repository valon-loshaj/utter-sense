public with sharing class KnowledgeDataImporter {
    // Path to the knowledge data JSON file
    static String knowledgeDataPath = '/data/data-knowledge.json';
    
    public class KnowledgeDataTree {
        public List<Knowledge__kav> records;
    }
    
    public static void importKnowledgeData() {
        try {
            // Get the JSON content from the local file
            StaticResource knowledgeData = [
                SELECT Id, Body 
                FROM StaticResource 
                WHERE Name = 'utter_sense_knowledge_data' 
                LIMIT 1
            ];
            
            if (knowledgeData == null) {
                throw new KnowledgeDataException('Knowledge data static resource not found. Please ensure the JSON file is uploaded as a static resource named "KnowledgeData".');
            }
            
            // Parse the JSON data into Knowledge article records
            KnowledgeDataTree treeData = (KnowledgeDataTree) JSON.deserialize(
                knowledgeData.Body.toString(),
                KnowledgeDataTree.class
            );
            
            if (treeData.records == null || treeData.records.isEmpty()) {
                throw new KnowledgeDataException('No knowledge records found in the data file.');
            }
            
            // Insert and publish each article
            Integer successCount = 0;
            Integer failureCount = 0;
            Long timestamp = System.now().getTime();
            
            for (Knowledge__kav article : treeData.records) {
                try {
                    // Make URL name unique by adding timestamp
                    String baseUrlName = article.UrlName != null ? article.UrlName : article.Title.replaceAll('[^a-zA-Z0-9]', '-').toLowerCase();
                    article.UrlName = baseUrlName + '-' + timestamp;
                    article.Language = 'en_US';  // Ensure language is set
                    
                    // Insert the draft article
                    insert article;
                    timestamp++; // Increment timestamp to ensure uniqueness for next article
                    
                    // Query for the KnowledgeArticleId
                    Knowledge__kav insertedArticle = [
                        SELECT Id, KnowledgeArticleId, Title 
                        FROM Knowledge__kav 
                        WHERE Id = :article.Id 
                        LIMIT 1
                    ];
                    
                    if (insertedArticle.KnowledgeArticleId != null) {
                        // Publish the article immediately
                        KbManagement.PublishingService.publishArticle(insertedArticle.KnowledgeArticleId, true);
                        successCount++;
                        System.debug('Successfully created and published article: ' + article.Title);
                    } else {
                        failureCount++;
                        System.debug('Failed to publish article: ' + article.Title + ' - KnowledgeArticleId was null');
                    }
                } catch (Exception e) {
                    failureCount++;
                    System.debug('Error processing article "' + article.Title + '": ' + e.getMessage());
                }
            }
            
            System.debug('Knowledge import completed. Successful imports: ' + successCount + ', Failed imports: ' + failureCount);
            
        } catch (Exception e) {
            System.debug('Error during knowledge import: ' + e.getMessage());
            throw new KnowledgeDataException('Failed to import knowledge data: ' + e.getMessage());
        }
    }
    
    public class KnowledgeDataException extends Exception {}
}